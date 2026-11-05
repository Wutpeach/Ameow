FFmpeg 64-bit static Windows build from www.gyan.dev

Version: 9.0.2-essentials_build-www.gyan.dev

License: GPL v3

Source Code: https://github.com/FFmpeg/FFmpeg/commit/946fcce07b

release-essentials build configuration: 

ARCH                      x86 (generic)
big-endian                no
runtime cpu detection     yes
standalone assembly       yes
x86 assembler             nasm
MMX enabled               yes
MMXEXT enabled            yes
SSE enabled               yes
SSSE3 enabled             yes
AESNI enabled             yes
CLMUL enabled             yes
AVX enabled               yes
AVX2 enabled              yes
AVX-512 enabled           yes
AVX-512ICL enabled        yes
XOP enabled               yes
FMA3 enabled              yes
FMA4 enabled              yes
i686 features enabled     yes
CMOV is fast              yes
EBX available             yes
EBP available             yes
debug symbols             yes
strip symbols             yes
optimize for size         no
optimizations             yes
static                    yes
shared                    no
network support           yes
threading support         pthreads
safe bitstream reader     yes
texi2html enabled         no
perl enabled              yes
pod2man enabled           yes
makeinfo enabled          yes
makeinfo supports HTML    yes
experimental features     yes
xmllint enabled           yes

External libraries:
avisynth                libmp3lame              libvorbis
bzlib                   libopencore_amrnb       libvpx
cairo                   libopencore_amrwb       libwebp
gmp                     libopenjpeg             libx264
gnutls                  libopenmpt              libx265
iconv                   libopus                 libxml2
libaom                  librubberband           libxvid
libass                  libspeex                libzimg
libfontconfig           libsrt                  libzmq
libfreetype             libssh                  lzma
libfribidi              libtheora               mediafoundation
libgme                  libvidstab              openal
libgsm                  libvmaf                 sdl2
libharfbuzz             libvo_amrwbenc          zlib

External libraries providing hardware acceleration:
amf                     d3d12va                 nvdec
cuda                    dxva2                   nvenc
cuda_llvm               ffnvcodec               vaapi
cuvid                   libmfx
d3d11va                 libvpl

Libraries:
avcodec                 avformat                swscale
avdevice                avutil
avfilter                swresample

Programs:
ffmpeg                  ffplay                  ffprobe

Enabled decoders:
aac                     flac                    pcm_vidc
aac_fixed               flashsv                 pcx
aac_latm                flashsv2                pdv
aasc                    flic                    pfm
ac3                     flv                     pgm
ac3_fixed               fmvc                    pgmyuv
acelp_kelvin            fourxm                  pgssub
adpcm_4xm               fraps                   pgx
adpcm_adx               frwu                    phm
adpcm_afc               ftr                     photocd
adpcm_agm               g2m                     pictor
adpcm_aica              g723_1                  pixlet
adpcm_argo              g728                    pjs
adpcm_circus            g729                    png
adpcm_ct                gdv                     ppm
adpcm_dtk               gem                     prores
adpcm_ea                gif                     prores_raw
adpcm_ea_maxis_xa       gremlin_dpcm            prosumer
adpcm_ea_r1             gsm                     psd
adpcm_ea_r2             gsm_ms                  ptx
adpcm_ea_r3             h261                    qcelp
adpcm_ea_xas            h263                    qdm2
adpcm_g722              h263i                   qdmc
adpcm_g726              h263p                   qdraw
adpcm_g726le            h264                    qoa
adpcm_ima_acorn         h264_amf                qoi
adpcm_ima_alp           h264_cuvid              qpeg
adpcm_ima_amv           h264_qsv                qtrle
adpcm_ima_apc           hap                     r10k
adpcm_ima_apm           hca                     r210
adpcm_ima_cunning       hcom                    ra_144
adpcm_ima_dat4          hdr                     ra_288
adpcm_ima_dk3           hevc                    ralf
adpcm_ima_dk4           hevc_amf                rasc
adpcm_ima_ea_eacs       hevc_cuvid              rawvideo
adpcm_ima_ea_sead       hevc_qsv                realtext
adpcm_ima_escape        hnm4_video              rka
adpcm_ima_hvqm2         hq_hqa                  rl2
adpcm_ima_hvqm4         hqx                     roq
adpcm_ima_iss           huffyuv                 roq_dpcm
adpcm_ima_magix         hymt                    rpza
adpcm_ima_moflex        iac                     rscc
adpcm_ima_mtf           idcin                   rtv1
adpcm_ima_oki           idf                     rv10
adpcm_ima_pda           iff_ilbm                rv20
adpcm_ima_qt            ilbc                    rv30
adpcm_ima_rad           imc                     rv40
adpcm_ima_smjpeg        imm4                    rv60
adpcm_ima_ssi           imm5                    s302m
adpcm_ima_wav           indeo2                  sami
adpcm_ima_ws            indeo3                  sanm
adpcm_ima_xbox          indeo4                  sbc
adpcm_ms                indeo5                  scpr
adpcm_mtaf              interplay_acm           screenpresso
adpcm_n64               interplay_dpcm          sdx2_dpcm
adpcm_psx               interplay_video         sga
adpcm_psxc              ipu                     sgi
adpcm_sanyo             jacosub                 sgirle
adpcm_sbpro_2           jpeg2000                sheervideo
adpcm_sbpro_3           jpegls                  shorten
adpcm_sbpro_4           jv                      simbiosis_imx
adpcm_swf               kgv1                    sipr
adpcm_thp               kmvc                    siren
adpcm_thp_le            lagarith                smackaud
adpcm_vima              lead                    smacker
adpcm_xa                libaom_av1              smc
adpcm_xmd               libgsm                  smvjpeg
adpcm_yamaha            libgsm_ms               snow
adpcm_zork              libopencore_amrnb       sol_dpcm
agm                     libopencore_amrwb       sp5x
ahx                     libopus                 speedhq
aic                     libspeex                speex
alac                    libvorbis               srgc
alias_pix               libvpx_vp8              srt
als                     libvpx_vp9              ssa
amrnb                   loco                    stl
amrwb                   lscr                    subrip
amv                     m101                    subviewer
anm                     mace3                   subviewer1
ansi                    mace6                   sunrast
anull                   magicyuv                svq1
apac                    mdec                    svq3
ape                     media100                tak
apng                    metasound               targa
aptx                    microdvd                targa_y216
aptx_hd                 mimic                   tdsc
apv                     misc4                   text
arbc                    mjpeg                   theora
argo                    mjpeg_cuvid             thp
ass                     mjpeg_qsv               tiertexseqvideo
asv1                    mjpegb                  tiff
asv2                    mlp                     tmv
atrac1                  mmvideo                 truehd
atrac3                  mobiclip                truemotion1
atrac3al                motionpixels            truemotion2
atrac3p                 movtext                 truemotion2rt
atrac3pal               mp1                     truespeech
atrac9                  mp1float                tscc
aura                    mp2                     tscc2
aura2                   mp2float                tta
av1                     mp3                     twinvq
av1_amf                 mp3adu                  txd
av1_cuvid               mp3adufloat             ulti
av1_qsv                 mp3float                utvideo
avrn                    mp3on4                  v210
avrp                    mp3on4float             v210x
avs                     mpc7                    vb
avui                    mpc8                    vble
bethsoftvid             mpeg1_cuvid             vbn
bfi                     mpeg1video              vc1
bink                    mpeg2_cuvid             vc1_cuvid
binkaudio_dct           mpeg2_qsv               vc1_qsv
binkaudio_rdft          mpeg2video              vc1image
bintext                 mpeg4                   vcr1
bitpacked               mpeg4_cuvid             vmdaudio
bmp                     mpegvideo               vmdvideo
bmv_audio               mpl2                    vmix
bmv_video               msa1                    vmnc
bonk                    mscc                    vnull
brender_pix             msmpeg4v1               vorbis
c93                     msmpeg4v2               vp3
cavs                    msmpeg4v3               vp4
cbd2_dpcm               msnsiren                vp5
ccaption                msp2                    vp6
cdgraphics              msrle                   vp6a
cdtoons                 mss1                    vp6f
cdxl                    mss2                    vp7
cfhd                    msvideo1                vp8
cinepak                 mszh                    vp8_cuvid
clearvideo              mts2                    vp8_qsv
cljr                    mv30                    vp9
cllc                    mvc1                    vp9_amf
comfortnoise            mvc2                    vp9_cuvid
cook                    mvdv                    vp9_qsv
cpia                    mvha                    vplayer
cri                     mwsc                    vqa
cscd                    mxpeg                   vqc
cyuv                    nellymoser              vvc
dca                     notchlc                 vvc_qsv
dds                     nuv                     wady_dpcm
derf_dpcm               on2avc                  wavarc
dfa                     opus                    wavpack
dfpwm                   osq                     wbmp
dirac                   paf_audio               wcmv
dnxhd                   paf_video               webp
dolby_e                 pam                     webp_anim
dpx                     pbm                     webvtt
dsd_lsbf                pcm_alaw                wmalossless
dsd_lsbf_planar         pcm_bluray              wmapro
dsd_msbf                pcm_dvd                 wmav1
dsd_msbf_planar         pcm_f16le               wmav2
dsicinaudio             pcm_f24le               wmavoice
dsicinvideo             pcm_f32be               wmv1
dss_sp                  pcm_f32le               wmv2
dst                     pcm_f64be               wmv3
dvaudio                 pcm_f64le               wmv3image
dvbsub                  pcm_lxf                 wnv1
dvdsub                  pcm_mulaw               wrapped_avframe
dvvideo                 pcm_s16be               ws_snd1
dxa                     pcm_s16be_planar        xan_dpcm
dxtory                  pcm_s16le               xan_wc3
dxv                     pcm_s16le_planar        xan_wc4
eac3                    pcm_s24be               xbin
eacmv                   pcm_s24daud             xbm
eamad                   pcm_s24le               xface
eatgq                   pcm_s24le_planar        xl
eatgv                   pcm_s32be               xma1
eatqi                   pcm_s32le               xma2
eightbps                pcm_s32le_planar        xpm
eightsvx_exp            pcm_s64be               xsub
eightsvx_fib            pcm_s64le               xwd
escape124               pcm_s8                  y41p
escape130               pcm_s8_planar           ylc
evrc                    pcm_sga                 yop
exr                     pcm_u16be               yuv4
fastaudio               pcm_u16le               zero12v
ffv1                    pcm_u24be               zerocodec
ffvhuff                 pcm_u24le               zlib
ffwavesynth             pcm_u32be               zmbv
fic                     pcm_u32le
fits                    pcm_u8

Enabled encoders:
a64multi                hdr                     pcm_s8_planar
a64multi5               hevc_amf                pcm_u16be
aac                     hevc_d3d12va            pcm_u16le
aac_mf                  hevc_mf                 pcm_u24be
ac3                     hevc_nvenc              pcm_u24le
ac3_fixed               hevc_qsv                pcm_u32be
ac3_mf                  hevc_vaapi              pcm_u32le
adpcm_adx               huffyuv                 pcm_u8
adpcm_argo              jpeg2000                pcm_vidc
adpcm_g722              jpegls                  pcx
adpcm_g726              libaom_av1              pdv
adpcm_g726le            libgsm                  pfm
adpcm_ima_alp           libgsm_ms               pgm
adpcm_ima_amv           libmp3lame              pgmyuv
adpcm_ima_apm           libopencore_amrnb       phm
adpcm_ima_qt            libopenjpeg             png
adpcm_ima_ssi           libopus                 ppm
adpcm_ima_wav           libspeex                prores
adpcm_ima_ws            libtheora               prores_aw
adpcm_ms                libvo_amrwbenc          prores_ks
adpcm_swf               libvorbis               qoi
adpcm_yamaha            libvpx_vp8              qtrle
alac                    libvpx_vp9              r10k
alias_pix               libwebp                 r210
amv                     libwebp_anim            ra_144
anull                   libx264                 rawvideo
apng                    libx264rgb              roq
aptx                    libx265                 roq_dpcm
aptx_hd                 libxvid                 rpza
ass                     ljpeg                   rv10
asv1                    magicyuv                rv20
asv2                    mjpeg                   s302m
av1_amf                 mjpeg_qsv               sbc
av1_d3d12va             mjpeg_vaapi             sgi
av1_mf                  mlp                     smc
av1_nvenc               movtext                 snow
av1_qsv                 mp2                     speedhq
av1_vaapi               mp2fixed                srt
avrp                    mp3_mf                  ssa
avui                    mpeg1video              subrip
bitpacked               mpeg2_qsv               sunrast
bmp                     mpeg2_vaapi             svq1
cfhd                    mpeg2video              targa
cinepak                 mpeg4                   text
cljr                    msmpeg4v2               tiff
comfortnoise            msmpeg4v3               truehd
dca                     msrle                   tta
dfpwm                   msvideo1                ttml
dnxhd                   nellymoser              utvideo
dpx                     opus                    v210
dvbsub                  pam                     vbn
dvdsub                  pbm                     vc2
dvvideo                 pcm_alaw                vnull
dxv                     pcm_bluray              vorbis
eac3                    pcm_dvd                 vp8_vaapi
exr                     pcm_f32be               vp9_qsv
ffv1                    pcm_f32le               vp9_vaapi
ffvhuff                 pcm_f64be               wavpack
fits                    pcm_f64le               wbmp
flac                    pcm_mulaw               webvtt
flashsv                 pcm_s16be               wmav1
flashsv2                pcm_s16be_planar        wmav2
flv                     pcm_s16le               wmv1
g723_1                  pcm_s16le_planar        wmv2
gif                     pcm_s24be               wrapped_avframe
h261                    pcm_s24daud             xbm
h263                    pcm_s24le               xface
h263p                   pcm_s24le_planar        xsub
h264_amf                pcm_s32be               xwd
h264_d3d12va            pcm_s32le               y41p
h264_mf                 pcm_s32le_planar        yuv4
h264_nvenc              pcm_s64be               zlib
h264_qsv                pcm_s64le               zmbv
h264_vaapi              pcm_s8

Enabled hwaccels:
av1_d3d11va             hevc_nvdec              vc1_nvdec
av1_d3d11va2            hevc_vaapi              vc1_vaapi
av1_d3d12va             mjpeg_nvdec             vp8_nvdec
av1_dxva2               mjpeg_vaapi             vp8_vaapi
av1_nvdec               mpeg1_nvdec             vp9_d3d11va
av1_vaapi               mpeg2_d3d11va           vp9_d3d11va2
h263_vaapi              mpeg2_d3d11va2          vp9_d3d12va
h264_d3d11va            mpeg2_d3d12va           vp9_dxva2
h264_d3d11va2           mpeg2_dxva2             vp9_nvdec
h264_d3d12va            mpeg2_nvdec             vp9_vaapi
h264_dxva2              mpeg2_vaapi             vvc_vaapi
h264_nvdec              mpeg4_nvdec             wmv3_d3d11va
h264_vaapi              mpeg4_vaapi             wmv3_d3d11va2
hevc_d3d11va            vc1_d3d11va             wmv3_d3d12va
hevc_d3d11va2           vc1_d3d11va2            wmv3_dxva2
hevc_d3d12va            vc1_d3d12va             wmv3_nvdec
hevc_dxva2              vc1_dxva2               wmv3_vaapi

Enabled parsers:
aac                     dvdsub                  mpegaudio
aac_latm                evc                     mpegvideo
ac3                     ffv1                    opus
adx                     flac                    png
ahx                     ftr                     pnm
amr                     g723_1                  prores
apv                     g729                    prores_raw
av1                     gif                     qoi
avs2                    gsm                     rv34
avs3                    h261                    sbc
bmp                     h263                    sipr
cavsvideo               h264                    tak
cook                    hdr                     vc1
cri                     hevc                    vorbis
dca                     ipu                     vp3
dirac                   jpeg2000                vp8
dnxhd                   jpegxl                  vp9
dnxuc                   jpegxs                  vvc
dolby_e                 lcevc                   webp
dpx                     misc4                   xbm
dvaudio                 mjpeg                   xma
dvbsub                  mlp                     xwd
dvd_nav                 mpeg4video

Enabled demuxers:
aa                      idcin                   pcm_mulaw
aac                     idf                     pcm_s16be
aax                     iff                     pcm_s16le
ac3                     ifv                     pcm_s24be
ac4                     ilbc                    pcm_s24le
ace                     image2                  pcm_s32be
acm                     image2_alias_pix        pcm_s32le
act                     image2_brender_pix      pcm_s8
adf                     image2pipe              pcm_u16be
adp                     image_bmp_pipe          pcm_u16le
ads                     image_cri_pipe          pcm_u24be
adx                     image_dds_pipe          pcm_u24le
aea                     image_dpx_pipe          pcm_u32be
afc                     image_exr_pipe          pcm_u32le
aiff                    image_gem_pipe          pcm_u8
aix                     image_gif_pipe          pcm_vidc
alp                     image_hdr_pipe          pdv
amr                     image_j2k_pipe          pjs
amrnb                   image_jpeg_pipe         pmp
amrwb                   image_jpegls_pipe       pp_bnk
anm                     image_jpegxl_pipe       pva
apac                    image_jpegxs_pipe       pvf
apc                     image_pam_pipe          qcp
ape                     image_pbm_pipe          qoa
apm                     image_pcx_pipe          r3d
apng                    image_pfm_pipe          rawvideo
aptx                    image_pgm_pipe          rcwt
aptx_hd                 image_pgmyuv_pipe       realtext
apv                     image_pgx_pipe          redspark
aqtitle                 image_phm_pipe          rka
argo_asf                image_photocd_pipe      rl2
argo_brp                image_pictor_pipe       rm
argo_cvg                image_png_pipe          roq
asf                     image_ppm_pipe          rpl
asf_o                   image_psd_pipe          rsd
ass                     image_qdraw_pipe        rso
ast                     image_qoi_pipe          rtp
au                      image_sgi_pipe          rtsp
av1                     image_sunrast_pipe      s337m
avi                     image_svg_pipe          sami
avisynth                image_tiff_pipe         sap
avr                     image_vbn_pipe          sbc
avs                     image_webp_pipe         sbg
avs2                    image_xbm_pipe          scc
avs3                    image_xpm_pipe          scd
bethsoftvid             image_xwd_pipe          sdns
bfi                     imf                     sdp
bfstm                   ingenient               sdr2
bink                    ipmovie                 sds
binka                   ipu                     sdx
bintext                 ircam                   segafilm
bit                     iss                     ser
bitpacked               iv8                     sga
bmv                     ivf                     shorten
boa                     ivr                     siff
bonk                    jacosub                 simbiosis_imx
brstm                   jpegxl_anim             sln
c93                     jv                      smacker
caf                     kux                     smjpeg
cavsvideo               kvag                    smush
cdg                     laf                     sol
cdxl                    lc3                     sox
cine                    libgme                  spdif
codec2                  libopenmpt              srt
codec2raw               live_flv                stl
concat                  lmlm4                   str
dash                    loas                    subviewer
data                    lrc                     subviewer1
daud                    luodat                  sup
dcstr                   lvf                     svag
derf                    lxf                     svs
dfa                     m4v                     swf
dfpwm                   matroska                tak
dhav                    mca                     tedcaptions
dirac                   mcc                     thp
dnxhd                   mgsts                   threedostr
dsf                     microdvd                tiertexseq
dsicin                  mjpeg                   tmv
dss                     mjpeg_2000              truehd
dts                     mlp                     tta
dtshd                   mlv                     tty
dv                      mm                      txd
dvbsub                  mmf                     ty
dvbtxt                  mods                    usm
dxa                     moflex                  v210
ea                      mov                     v210x
ea_cdata                mp3                     vag
eac3                    mpc                     vc1
epaf                    mpc8                    vc1t
evc                     mpegps                  vividas
ffmetadata              mpegts                  vivo
filmstrip               mpegtsraw               vmd
fits                    mpegvideo               vobsub
flac                    mpjpeg                  voc
flic                    mpl2                    vpk
flv                     mpsub                   vplayer
fourxm                  msf                     vqf
frm                     msnwc_tcp               vvc
fsb                     msp                     w64
fwse                    mtaf                    wady
g722                    mtv                     wav
g723_1                  musx                    wavarc
g726                    mv                      wc3
g726le                  mvi                     webm_dash_manifest
g728                    mxf                     webp_anim
g729                    mxg                     webvtt
gdv                     nc                      wsaud
genh                    nistsphere              wsd
gif                     nsp                     wsvqa
gsm                     nsv                     wtv
gxf                     nut                     wv
h261                    nuv                     wve
h263                    obu                     xa
h264                    ogg                     xbin
hca                     oma                     xmd
hcom                    osq                     xmv
hevc                    paf                     xvag
hls                     pcm_alaw                xwma
hnm                     pcm_f32be               yop
hxvs                    pcm_f32le               yuv4mpegpipe
iamf                    pcm_f64be
ico                     pcm_f64le

Enabled muxers:
a64                     h264                    pcm_s24le
ac3                     hash                    pcm_s32be
ac4                     hds                     pcm_s32le
adts                    hevc                    pcm_s8
adx                     hls                     pcm_u16be
aea                     iamf                    pcm_u16le
aiff                    ico                     pcm_u24be
alp                     ilbc                    pcm_u24le
amr                     image2                  pcm_u32be
amv                     image2pipe              pcm_u32le
apm                     ipod                    pcm_u8
apng                    ircam                   pcm_vidc
aptx                    ismv                    pdv
aptx_hd                 ivf                     psp
apv                     jacosub                 rawvideo
argo_asf                kvag                    rcwt
argo_cvg                latm                    rm
asf                     lc3                     roq
asf_stream              lrc                     rso
ass                     m4v                     rtp
ast                     matroska                rtp_mpegts
au                      matroska_audio          rtsp
avi                     mcc                     sap
avif                    md5                     sbc
avm2                    microdvd                scc
avs2                    mjpeg                   segafilm
avs3                    mkvtimestamp_v2         segment
bit                     mlp                     smjpeg
caf                     mmf                     smoothstreaming
cavsvideo               mov                     sox
codec2                  mp2                     spdif
codec2raw               mp3                     spx
crc                     mp4                     srt
dash                    mpeg1system             stream_segment
data                    mpeg1vcd                streamhash
daud                    mpeg1video              sup
dfpwm                   mpeg2dvd                swf
dirac                   mpeg2svcd               tee
dnxhd                   mpeg2video              tg2
dts                     mpeg2vob                tgp
dv                      mpegts                  truehd
eac3                    mpjpeg                  tta
evc                     mxf                     ttml
f4v                     mxf_d10                 uncodedframecrc
ffmetadata              mxf_opatom              vc1
fifo                    null                    vc1t
filmstrip               nut                     voc
fits                    obu                     vvc
flac                    oga                     w64
flv                     ogg                     wav
framecrc                ogv                     webm
framehash               oma                     webm_chunk
framemd5                opus                    webm_dash_manifest
g722                    pcm_alaw                webp
g723_1                  pcm_f32be               webvtt
g726                    pcm_f32le               whip
g726le                  pcm_f64be               wsaud
gif                     pcm_f64le               wtv
gsm                     pcm_mulaw               wv
gxf                     pcm_s16be               yuv4mpegpipe
h261                    pcm_s16le
h263                    pcm_s24be

Enabled protocols:
async                   http                    rtmp
cache                   httpproxy               rtmpe
concat                  https                   rtmps
concatf                 icecast                 rtmpt
crypto                  ipfs_gateway            rtmpte
data                    ipns_gateway            rtmpts
dtls                    libsrt                  rtp
fd                      libssh                  srtp
ffrtmpcrypt             libzmq                  subfile
ffrtmphttp              md5                     tcp
file                    mmsh                    tee
ftp                     mmst                    tls
gopher                  pipe                    udp
gophers                 prompeg                 udplite

Enabled filters:
a3dscope                dcshift                 pan
aap                     dctdnoiz                perlin
abench                  ddagrab                 perms
abitscope               deband                  perspective
acompressor             deblock                 phase
acontrast               decimate                photosensitivity
acopy                   deconvolve              pixdesctest
acrossfade              dedot                   pixelize
acrossover              deesser                 pixscope
acrusher                deflate                 pp7
acue                    deflicker               premultiply
addroi                  deinterlace_d3d12       premultiply_dynamic
adeclick                deinterlace_qsv         prewitt
adeclip                 deinterlace_vaapi       procamp_vaapi
adecorrelate            dejudder                pseudocolor
adelay                  delogo                  psnr
adenorm                 denoise_vaapi           pullup
aderivative             deshake                 qp
adrawgraph              despill                 random
adrc                    detelecine              readeia608
adynamicequalizer       dialoguenhance          readvitc
adynamicsmooth          dilation                realtime
aecho                   displace                remap
aemphasis               doubleweave             removegrain
aeval                   drawbox                 removelogo
aevalsrc                drawbox_vaapi           repeatfields
aexciter                drawgraph               replaygain
afade                   drawgrid                reverse
afdelaysrc              drawtext                rgbashift
afftdn                  drawvg                  rgbtestsrc
afftfilt                drmeter                 roberts
afir                    dynaudnorm              rotate
afireqsrc               earwax                  rubberband
afirsrc                 ebur128                 sab
aformat                 edgedetect              scale
afreqshift              elbg                    scale2ref
afwtdn                  entropy                 scale_cuda
agate                   epx                     scale_d3d11
agraphmonitor           eq                      scale_d3d12
ahistogram              equalizer               scale_qsv
aiir                    erosion                 scale_vaapi
aintegral               estdif                  scdet
ainterleave             exposure                scharr
alatency                extractplanes           scroll
alimiter                extrastereo             segment
allpass                 fade                    select
allrgb                  feedback                selectivecolor
allyuv                  fftdnoiz                sendcmd
aloop                   fftfilt                 separatefields
alphaextract            field                   setdar
alphamerge              fieldhint               setfield
amerge                  fieldmatch              setparams
ametadata               fieldorder              setpts
amf_capture             fillborders             setrange
amix                    find_rect               setsar
amovie                  firequalizer            settb
amplify                 flanger                 sharpness_vaapi
amultiply               floodfill               shear
anequalizer             format                  showcqt
anlmdn                  fps                     showcwt
anlmf                   framepack               showfreqs
anlms                   framerate               showinfo
anoisesrc               framestep               showpalette
anull                   frc_amf                 showspatial
anullsink               freezedetect            showspectrum
anullsrc                freezeframes            showspectrumpic
apad                    fspp                    showvolume
aperms                  fsync                   showwaves
aphasemeter             gblur                   showwavespic
aphaser                 geq                     shuffleframes
aphaseshift             gfxcapture              shufflepixels
apsnr                   gradfun                 shuffleplanes
apsyclip                gradients               sidechaincompress
apulsator               graphmonitor            sidechaingate
arealtime               grayworld               sidedata
aresample               greyedge                sierpinski
areverse                guided                  signalstats
arls                    haas                    signature
arnndn                  haldclut                silencedetect
asdr                    haldclutsrc             silenceremove
asegment                hdcd                    sinc
aselect                 headphone               sine
asendcmd                hflip                   siti
asetnsamples            highpass                smartblur
asetpts                 highshelf               smptebars
asetrate                hilbert                 smptehdbars
asettb                  histeq                  sobel
ashowinfo               histogram               spectrumsynth
asidedata               hqdn3d                  speechnorm
asisdr                  hqx                     split
asoftclip               hstack                  spp
aspectralstats          hstack_qsv              sr_amf
asplit                  hstack_vaapi            ssim
ass                     hsvhold                 ssim360
astats                  hsvkey                  stereo3d
astreamselect           hue                     stereotools
asubboost               huesaturation           stereowiden
asubcut                 hwdownload              streamselect
asupercut               hwmap                   subtitles
asuperpass              hwupload                super2xsai
asuperstop              hwupload_cuda           superequalizer
atadenoise              hysteresis              surround
atempo                  identity                swaprect
atilt                   idet                    swapuv
atrim                   il                      tblend
avectorscope            inflate                 telecine
avgblur                 interlace               testsrc
avsynctest              interleave              testsrc2
axcorrelate             join                    thistogram
azmq                    kerndeint               threshold
backgroundkey           kirsch                  thumbnail
bandpass                lagfun                  thumbnail_cuda
bandreject              latency                 tile
bass                    lenscorrection          tiltandshift
bbox                    libvmaf                 tiltshelf
bench                   life                    tinterlace
bilateral               limitdiff               tlut2
bilateral_cuda          limiter                 tmedian
biquad                  loop                    tmidequalizer
bitplanenoise           loudnorm                tmix
blackdetect             lowpass                 tonemap
blackframe              lowshelf                tonemap_vaapi
blend                   lumakey                 tpad
blockdetect             lut                     transpose
blurdetect              lut1d                   transpose_cuda
bm3d                    lut2                    transpose_vaapi
boxblur                 lut3d                   treble
bwdif                   lutrgb                  tremolo
bwdif_cuda              lutyuv                  trim
cas                     mandelbrot              unpremultiply
ccrepack                maskedclamp             unsharp
cellauto                maskedmax               untile
channelmap              maskedmerge             uspp
channelsplit            maskedmin               v360
chorus                  maskedthreshold         vaguedenoiser
chromahold              maskfun                 varblur
chromakey               mcdeint                 vectorscope
chromakey_cuda          mcompand                vflip
chromanr                median                  vfrdet
chromashift             mergeplanes             vibrance
ciescope                mestimate               vibrato
codecview               mestimate_d3d12         vidstabdetect
color                   metadata                vidstabtransform
colorbalance            midequalizer            vif
colorchannelmixer       minterpolate            vignette
colorchart              mix                     virtualbass
colorcontrast           monochrome              vmafmotion
colorcorrect            morpho                  volume
colordetect             movie                   volumedetect
colorhold               mpdecimate              vpp_amf
colorize                mptestsrc               vpp_qsv
colorkey                msad                    vstack
colorlevels             multiply                vstack_qsv
colormap                negate                  vstack_vaapi
colormatrix             nlmeans                 w3fdif
colorspace              nnedi                   waveform
colorspace_cuda         noformat                weave
colorspectrum           noise                   xbr
colortemperature        normalize               xcorrelate
compand                 null                    xfade
compensationdelay       nullsink                xmedian
concat                  nullsrc                 xpsnr
convolution             oscilloscope            xstack
convolve                overlay                 xstack_qsv
copy                    overlay_cuda            xstack_vaapi
corr                    overlay_qsv             yadif
cover_rect              overlay_vaapi           yadif_cuda
crop                    owdenoise               yaepblur
cropdetect              pad                     yuvtestsrc
crossfeed               pad_cuda                zmq
crystalizer             pad_vaapi               zoneplate
cue                     pal100bars              zoompan
curves                  pal75bars               zscale
datascope               palettegen
dblur                   paletteuse

Enabled bsfs:
aac_adtstoasc           filter_units            opus_metadata
ahx_to_mp2              h264_metadata           pcm_rechunk
apv_metadata            h264_mp4toannexb        pgs_frame_merge
av1_frame_merge         h264_redundant_pps      prores_metadata
av1_frame_split         hapqa_extract           remove_extradata
av1_metadata            hevc_metadata           setts
chomp                   hevc_mp4toannexb        showinfo
dca_core                imx_dump_header         smpte436m_to_eia608
dovi_rpu                lcevc_metadata          text2movsub
dovi_split              media100_to_mjpegb      trace_headers
dts2pts                 mjpeg2jpeg              truehd_core
dump_extradata          mjpega_dump_header      vp9_metadata
dv_error_marker         mov2textsub             vp9_raw_reorder
eac3_core               mpeg2_metadata          vp9_superframe
eia608_to_smpte436m     mpeg4_unpack_bframes    vp9_superframe_split
evc_frame_merge         noise                   vvc_metadata
extract_extradata       null                    vvc_mp4toannexb

Enabled indevs:
dshow                   lavfi                   vfwcap
gdigrab                 openal

Enabled outdevs:

release-essentials external libraries' versions: 

AMF v1.5.2-2-gc35f613
aom v3.15.0-25-g023743a7d7
AviSynthPlus v3.7.5-383-g5c82777b
cairo 1.18.5
ffnvcodec n13.1.15.0-1-geddcea9
freetype VER-2-14-3
fribidi v1.0.16-19-gc928e4c
gsm 1.0.24
harfbuzz 14.4.0-108-g64e2b532
lame 3.100
libass 0.17.5-8-gb2fe9d8
libgme 0.6.6
libopencore-amrnb 0.1.6
libopencore-amrwb 0.1.6
libssh 0.12.2
libtheora v1.2.0
libwebp v1.6.0-249-g1f34635
openal-soft 1.25.2-48-g7532541
openjpeg2 2.5.4
openmpt libopenmpt-0.6.30-3-g6c0a06bc
opus v1.6.1-68-g503d81b1
rubberband v4.0.0
SDL release-2.32.0-234-gb90ac9502
speex Speex-1.2.1-51-g0589522
srt v1.5.7-7-gcae8f62
VAAPI 2.25.0.
vidstab v1.1.2-214-ge2445c4
vmaf v3.2.0-13-gf85a8536
vo-amrwbenc 0.1.3
vorbis v1.3.7-37-g1b75110b
VPL 2.17
vpx v1.17.0-57-gd2413e2ca
x264 v0.165.3223
x265 4.3-45-g116b875
xvid v1.3.7
zeromq 4.3.5
zimg release-3.0.6-253-g67e0603

