import subprocess, numpy as np, cv2, sys, math
src, out, amp = sys.argv[1], sys.argv[2], float(sys.argv[3]); REMOVE = len(sys.argv) > 4 and sys.argv[4] == "remove"
W=H=480
raw=subprocess.run(["ffmpeg","-v","error","-i",src,"-f","rawvideo","-pix_fmt","bgr24","-"],capture_output=True).stdout
F=np.frombuffer(raw,np.uint8).reshape(-1,H,W,3).copy(); n=len(F)
ref=F[70]; cx,cy=382,410
tmpl=ref[cy-30:cy+30, cx-35:cx+35]
yy,xx=np.mgrid[0:H,0:W].astype(np.float32)
cycles=round(n/24*3.9); log=[]
for i in range(n):
    fr=F[i]
    # find the nose near its last known spot
    x0,y0=max(cx-80,0),max(cy-70,0); win=fr[y0:cy+70, x0:cx+80]
    r=cv2.matchTemplate(win,tmpl,cv2.TM_CCOEFF_NORMED); _,mv,_,ml=cv2.minMaxLoc(r)
    nx,ny=x0+ml[0]+35, y0+ml[1]+30; log.append((nx,ny,round(mv,2)))
    # 1) remove white sniff lines around the snout (not the eye/nose highlights, not the tail)
    hsv=cv2.cvtColor(fr,cv2.COLOR_BGR2HSV)
    white=((hsv[...,2]>228)&(hsv[...,1]<36)).astype(np.uint8)
    region=np.zeros_like(white); cv2.rectangle(region,(nx-95,ny-45),(nx+95,ny+60),1,-1)
    cv2.rectangle(region,(nx-22,ny-22),(nx+24,ny+22),0,-1)   # keep the nose's own highlight
    region[:max(ny-45,0)]=0
    m=white*region
    nl,lab,st,_=cv2.connectedComponentsWithStats(m,8)
    keep=np.zeros_like(m)
    for k in range(1,nl):
        x,y,w,h,a=st[k]
        if a>=3 and max(w,h)>=3: keep[lab==k]=1
    if keep.any() and REMOVE:
        keep=cv2.dilate(keep,np.ones((3,3),np.uint8),iterations=1)
        fr=cv2.inpaint(fr,keep*255,3,cv2.INPAINT_TELEA)
    # 2) nose wiggle: shift only the nose area left/right with a soft falloff
    dx=amp*math.sin(2*math.pi*cycles*i/n)
    g=np.exp(-(((xx-nx)/26.0)**2+((yy-ny)/22.0)**2)).astype(np.float32)
    fr=cv2.remap(fr, xx-dx*g, yy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    F[i]=fr
p=subprocess.Popen(["ffmpeg","-v","error","-y","-f","rawvideo","-pix_fmt","bgr24","-s",f"{W}x{H}","-r","24","-i","-","-c:v","libx264","-crf","16","-pix_fmt","yuv420p",out],stdin=subprocess.PIPE)
p.stdin.write(F.tobytes()); p.stdin.close(); p.wait()
print("frames",n,"match min",min(l[2] for l in log),"nose x range",min(l[0] for l in log),max(l[0] for l in log),"y range",min(l[1] for l in log),max(l[1] for l in log))
