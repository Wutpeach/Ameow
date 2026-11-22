"""Explicit local-only native integration check; reads an existing managed tool cache."""
import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import socket
import ssl
import subprocess
import threading
import time
from urllib.parse import urlsplit

p = argparse.ArgumentParser()
p.add_argument('--root', required=True, type=Path)
p.add_argument('--tools', required=True, type=Path)
p.add_argument('--cases', nargs='+', choices=['success','denied','cancel','missing-processor'],
               default=['success','denied','cancel','missing-processor'])
p.add_argument('--openssl', type=Path, default=Path('C:/Program Files/Git/usr/bin/openssl.exe'))
a = p.parse_args()
root = a.root.resolve()
root.mkdir(parents=True, exist_ok=False)
tools = a.tools.resolve()
assert (tools/'complete.json').is_file()
flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
env = {'SystemRoot': os.environ['SystemRoot'], 'PATH': ''}
for key, folder in [('USERPROFILE','home'),('APPDATA','appdata'),('LOCALAPPDATA','localappdata'),('TEMP','temp'),('TMP','temp')]:
    path = root/folder
    path.mkdir(exist_ok=True)
    env[key] = str(path)

def run(args, timeout=20):
    return subprocess.run([str(x) for x in args], env=env, cwd=root, capture_output=True,
                          creationflags=flags, timeout=timeout)

ffmpeg = tools/'ffmpeg.exe'
source = root/'source.mp4'
r = run([ffmpeg,'-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=25',
         '-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','8','-c:v','libx264',
         '-threads','1','-preset','ultrafast','-g','25','-c:a','aac','-movflags','+faststart',source])
assert r.returncode == 0
for kind, mapping, extension in [('video','0:v:0','mp4'),('audio','0:a:0','m4a')]:
    r = run([ffmpeg,'-v','error','-i',source,'-map',mapping,'-c','copy','-movflags','+faststart',root/(kind+'.'+extension)])
    assert r.returncode == 0
cert, key = root/'cert.pem', root/'key.pem'
r = run([a.openssl,'req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,
         '-days','1','-subj','/CN=example.com'])
assert r.returncode == 0
tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
tls.load_cert_chain(cert,key)
plugin_root = root/'managed-plugins'
module = plugin_root/'ameow/yt_dlp_plugins/postprocessor/ameow_bounded_http.py'
module.parent.mkdir(parents=True)
source_module = Path(__file__).resolve().parents[1]/'src/download/adapters/yt_dlp/bounded_http.py'
module.write_bytes(source_module.read_bytes())
ledger = []
current = ''
media_started = threading.Event()

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):
        pass
    def do_CONNECT(self):
        if self.path != 'example.com:443':
            self.send_error(403)
            return
        ledger.append({'case':current,'method':'CONNECT'})
        self.send_response(200)
        self.end_headers()
        try:
            conn = tls.wrap_socket(self.connection, server_side=True)
            self.connection = conn
            self.rfile = conn.makefile('rb')
            self.wfile = conn.makefile('wb', buffering=0)
            self.close_connection = True
            self.handle_one_request()
        except (OSError,ssl.SSLError):
            pass
    def do_GET(self):
        url = urlsplit(self.path)
        if url.query or url.path not in ('/video.mp4','/audio.m4a'):
            self.send_error(403)
            return
        media_started.set()
        ranged = self.headers.get('Range')
        row = {'case':current,'method':'GET','stream':'video' if url.path.startswith('/video') else 'audio',
               'range':ranged,'sent':0}
        ledger.append(row)
        if current == 'denied':
            self.send_error(403)
            return
        data = (root/url.path.removeprefix('/')).read_bytes()
        first,last = 0,len(data)-1
        if ranged:
            left,right = ranged.removeprefix('bytes=').split('-')
            first=int(left or '0')
            if right:
                last=min(last,int(right))
        self.send_response(206 if ranged else 200)
        self.send_header('Content-Length',str(last-first+1))
        self.send_header('Accept-Ranges','bytes')
        if ranged:
            self.send_header('Content-Range',f'bytes {first}-{last}/{len(data)}')
        self.end_headers()
        try:
            for offset in range(first,last+1,4096):
                block=data[offset:min(offset+4096,last+1)]
                self.wfile.write(block)
                row['sent']+=len(block)
                if current=='cancel':
                    time.sleep(.03)
        except (OSError,ssl.SSLError):
            row['client_closed']=True

server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
server.daemon_threads=True
worker=threading.Thread(target=server.serve_forever)
worker.start()
formats=[{'format_id':'v','ext':'mp4','protocol':'https','url':'https://example.com/video.mp4',
          'vcodec':'h264','acodec':'none','width':320,'height':180,'fps':25},
         {'format_id':'a','ext':'m4a','protocol':'https','url':'https://example.com/audio.m4a',
          'vcodec':'none','acodec':'aac'}]
metadata={'id':'fixture-id','title':'Synthetic local section','extractor_key':'Youtube','extractor':'youtube',
          '_type':'video','duration':8,'is_live':False,'live_status':'not_live','ext':'mkv',
          'format_id':'v+a','protocol':'https+https','vcodec':'h264','acodec':'aac',
          'requested_formats':formats,'formats':formats,'webpage_url':'https://www.youtube.com/watch?v=abcdefghijk'}
info=root/'synthetic.json'
info.write_text(json.dumps(metadata),encoding='utf-8')
results=[]
try:
    for current in a.cases:
        media_started.clear()
        output=root/(current+'.mkv')
        args=[str(tools/'yt-dlp.exe'),'--ignore-config','--no-plugin-dirs','--plugin-dirs',str(plugin_root),
              '--use-postprocessor',('NoSuchAmeowProcessor' if current=='missing-processor' else 'AmeowBoundedHttp')+':when=before_dl',
              '--no-cache-dir','--no-js-runtimes','--proxy',f'http://127.0.0.1:{server.server_port}',
              '--ffmpeg-location',str(tools),'--no-check-certificates','--verbose','--load-info-json',str(info),
              '--download-sections','*1.250-4.750','--downloader-args','ffmpeg_i:-seekable 1 -xerror -tls_verify 0',
              '--downloader-args','ffmpeg_o:-progress pipe:1 -stats_period 0.2 -nostats',
              '--no-simulate','--merge-output-format','mkv','--output',str(output)]
        start=time.monotonic()
        proc=subprocess.Popen(args,env=env,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=flags)
        captured=[]
        reader=threading.Thread(target=lambda:captured.append(proc.communicate()))
        reader.start()
        cancellation_started=True
        try:
            if current=='cancel':
                cancellation_started=media_started.wait(20)
                if proc.poll() is None:
                    subprocess.run([env['SystemRoot']+'/System32/taskkill.exe','/PID',str(proc.pid),'/T','/F'],
                                   capture_output=True,creationflags=flags,timeout=10)
            reader.join(timeout=25)
            assert not reader.is_alive(),'native capture timed out'
        finally:
            if proc.poll() is None:
                subprocess.run([env['SystemRoot']+'/System32/taskkill.exe','/PID',str(proc.pid),'/T','/F'],
                               capture_output=True,creationflags=flags,timeout=10)
            reader.join(timeout=5)
        stdout,stderr=captured[0]
        text=(stdout+stderr).decode(errors='replace')
        result={'case':current,'exit':proc.returncode,'wall_s':round(time.monotonic()-start,3),
                'status':re.findall(r'AMEOW_BOUNDED_HTTP=(applied|not_applicable|conflict)',text),
                'request_size_inputs':text.count('-request_size 8388608'),
                'stream_copy':'-c copy' in text or '-c:v copy' in text,
                'output_bytes':output.stat().st_size if output.exists() else 0,
                'child_capture_joined':True}
        if current=='success':
            assert proc.returncode==0 and result['status']==['applied'], result
            assert result['request_size_inputs']==2 and result['stream_copy'],result
            media=run([tools/'ffprobe.exe','-v','error','-show_entries','stream=codec_name,width,height:format=duration','-of','json',output])
            result['media']=json.loads(media.stdout)
            assert {s['codec_name'] for s in result['media']['streams']}=={'h264','aac'}
            assert 3.25<=float(result['media']['format']['duration'])<=14
            decode=run([ffmpeg,'-v','error','-i',output,'-f','null','-'])
            assert decode.returncode==0 and not decode.stderr
            rows=[r for r in ledger if r['case']==current and r['method']=='GET']
            assert {r['stream'] for r in rows}=={'video','audio'}
            assert all(r['range'] and r['range'].split('-')[1] for r in rows)
            assert all(int(r['range'].split('-')[1])-int(r['range'].split('=')[1].split('-')[0])+1<=8388608 for r in rows)
        else:
            assert proc.returncode!=0,result
            if current=='cancel':
                assert cancellation_started,'native media never started before bounded cancellation wait'
            if current=='denied':
                assert '403 Forbidden' in text and result['status']==['applied']
            if current=='missing-processor':
                assert not result['status'] and not [r for r in ledger if r['case']==current]
        results.append(result)
finally:
    server.shutdown()
    server.server_close()
    worker.join(timeout=3)
    cleanup=[]
    for path in root.iterdir():
        if path.is_file() and (path.suffix in ('.mp4','.m4a','.mkv','.part') or '.part' in path.name):
            cleanup.append({'file':path.name,'bytes':path.stat().st_size})
            path.unlink()
    report={'results':results,'requests':ledger,'server_stopped':not worker.is_alive(),'media_cleanup':cleanup,
            'plugin_sha256':hashlib.sha256(source_module.read_bytes()).hexdigest(),
            'network_scope':'local TLS CONNECT fixture only; synthetic metadata; no user queue or account'}
    (root/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report))
