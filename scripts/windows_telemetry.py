"""Check runtime frame observations. This does not simulate Model or native calls."""
import json
from pathlib import Path


def analyze(path):
    frames=[json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    checks=[]
    def add(name,observed,ok):
        checks.append({"name":name,"status":"PASS" if ok else "FAIL","observed":observed})
    errors=[]
    for f in frames:
        b=f["bounds"];scale=f["scale"]
        gutter=10+4*((b[2]-b[0])/scale-80)/148
        if f["ms"]>100 and not f["drag"]:
            errors.append(max(abs(b[i]+gutter*scale-f["anchor"][i]) for i in (0,1)))
    add("actual native rectangles preserve surface anchor within pixel rounding",max(errors),max(errors)<=.51)
    mismatch=[f["ms"] for f in frames if f["viewport"]!=[f["bounds"][2]-f["bounds"][0],f["bounds"][3]-f["bounds"][1]]]
    add("GPUI viewport matches current actual native bounds",mismatch,not mismatch)
    segments=[]
    for f in frames:
        if not segments or segments[-1][0]["stage"]!=f["stage"]:
            segments.append([])
        segments[-1].append(f)
    monotonic=[];handoff=[];retention=[]
    for i,seg in enumerate(segments):
        stage=seg[0]["stage"]
        if stage in ("Downloading","Transcoding"):
            monotonic.append(all(b["progress"]>=a["progress"] and 0<=b["progress"]<=1 for a,b in zip(seg,seg[1:])))
        if stage=="Transcoding" and i and segments[i-1][0]["stage"]=="Downloading":
            prev=segments[i-1]
            completed=[f for f in prev if f["progress"]==1]
            handoff.append({"fully_closed_blue_observed":bool(completed),"completed_to_orange_ms":seg[0]["ms"]-completed[0]["ms"] if completed else None})
        if stage in ("Success","Failure","Cancelled") and i+1<len(segments) and segments[i+1][0]["stage"]=="Idle":
            retention.append({"stage":stage,"observed_ms":segments[i+1][0]["ms"]-seg[0]["ms"],"expected_ms":5000 if stage=="Failure" else 1500})
    add("actual progress samples remain monotonic and bounded within each active stage",monotonic,bool(monotonic) and all(monotonic))
    add("blue completes and holds before orange handoff",handoff,bool(handoff) and all(f["fully_closed_blue_observed"] and 70<=f["completed_to_orange_ms"]<=150 for f in handoff))
    add("actual terminal retirement follows 1500/5000 ms retention",retention,len(retention)>=5 and all(abs(f["observed_ms"]-f["expected_ms"])<=40 for f in retention))
    reduced=[f for f in frames if f["reduced"] and f["stage"]=="Resolving"]
    add("reduced Resolving emits only static arc values",{"frames":len(reduced),"arcs":list({tuple(f["arc"]) for f in reduced}),"note":"Runtime crop comparison separately proves static pixels over 350ms; optimized reduced rendering may emit one frame."},len(reduced)>=1 and len({tuple(f["arc"]) for f in reduced})==1)
    normal=[f for f in frames if not f["reduced"] and f["stage"]=="Resolving"]
    add("normal Resolving arc rotates across actual frames",{"frames":len(normal),"distinct_arcs":len({tuple(f["arc"]) for f in normal})},len({tuple(f["arc"]) for f in normal})>10)
    return {"source":path.name,"frame_count":len(frames),"checks":checks,"overall":"PASS" if all(x["status"]=="PASS" for x in checks) else "FAIL"}


if __name__=="__main__":
    evidence=Path(__file__).resolve().parents[1]/"evidence"
    report=analyze(evidence/"native-frames.jsonl")
    (evidence/"windows-telemetry-validation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))
    raise SystemExit(0 if report["overall"]=="PASS" else 1)
