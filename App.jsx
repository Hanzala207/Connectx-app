import { useState, useEffect, useRef, useCallback } from "react";

const genCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();
const genId   = () => Math.random().toString(36).substring(2, 14);
const nowTs   = () => Date.now();
const fmtTime = ts => new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
const fmtSize = b => b < 1024 ? `${b}B` : b < 1048576 ? `${(b/1024).toFixed(1)}KB` : `${(b/1048576).toFixed(1)}MB`;
const avColor = n => `hsl(${((n||"A").charCodeAt(0)*47)%360},65%,50%)`;
const EMOJIS  = ["😀","😂","❤️","👍","🔥","😍","🥺","😭","✨","🎉","👋","💯","🙏","😎","🤔","🫡","💪","🎊","🌟","😘"];
const BC = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("connectx") : null;
const db = {
  get: k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); BC?.postMessage({ key: k }); } catch {} }
};

export default function App() {
  const [screen,   setScreen]   = useState("splash");
  const [myName,   setMyName]   = useState("");
  const [nameIn,   setNameIn]   = useState("");
  const [myId]                  = useState(() => genId());
  const [roomCode, setRoomCode] = useState("");
  const [codeIn,   setCodeIn]   = useState("");
  const [messages, setMessages] = useState([]);
  const [members,  setMembers]  = useState([]);
  const [inputMsg, setInputMsg] = useState("");
  const [showEmoji,setShowEmoji]= useState(false);
  const [callState,setCallState]= useState(null);
  const [notif,    setNotif]    = useState(null);
  const [tab,      setTab]      = useState("chat");
  const [sharedFiles,setSharedFiles] = useState([]);
  const [copied,   setCopied]   = useState(false);
  const [incoming, setIncoming] = useState(null);
  const [callSecs, setCallSecs] = useState(0);
  const [reply,    setReply]    = useState(null);
  const [reactions,setReactions]= useState({});
  const [reactFor, setReactFor] = useState(null);
  const [prevLen,  setPrevLen]  = useState(0);
  const endRef     = useRef(null);
  const fileRef    = useRef(null);
  const pollRef    = useRef(null);
  const timerRef   = useRef(null);
  const vidSelfRef = useRef(null);
  const streamRef  = useRef(null);

  useEffect(() => { setTimeout(() => setScreen("home"), 2000); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    if (callState?.active) { timerRef.current = setInterval(() => setCallSecs(s => s+1), 1000); }
    else { clearInterval(timerRef.current); setCallSecs(0); }
    return () => clearInterval(timerRef.current);
  }, [callState?.active]);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const c = p.get("join");
    if (c) setCodeIn(c.toUpperCase());
  }, []);

  useEffect(() => {
    if (!roomCode) return;
    const poll = () => {
      const data = db.get(`cx_${roomCode}`);
      if (!data) return;
      const msgs = data.messages || [];
      if (msgs.length > prevLen) {
        const newOnes = msgs.slice(prevLen);
        setMessages([...msgs]);
        setPrevLen(msgs.length);
        newOnes.forEach(m => { if (m.senderId !== myId) showNotif(m.senderName, m.type === "file" ? `📎 ${m.fileName}` : m.text); });
      }
      setMembers((data.members || []).filter(m => nowTs() - m.lastSeen < 12000));
      if (data.files) setSharedFiles(data.files);
      if (data.reactions) setReactions(data.reactions);
      if (data.call && data.call.callerId !== myId && !callState)
        if (nowTs() - data.call.ts < 25000) setIncoming(data.call);
    };
    pollRef.current = setInterval(poll, 1500);
    if (BC) BC.onmessage = () => poll();
    poll();
    return () => { clearInterval(pollRef.current); if (BC) BC.onmessage = null; };
  }, [roomCode, prevLen, myId, callState]);

  useEffect(() => {
    if (!roomCode || !myName) return;
    const beat = () => {
      const data = db.get(`cx_${roomCode}`) || { messages:[], members:[], files:[], reactions:{}, call:null };
      const others = (data.members||[]).filter(m => m.id !== myId);
      db.set(`cx_${roomCode}`, { ...data, members:[...others,{id:myId,name:myName,lastSeen:nowTs()}] });
    };
    beat();
    const hb = setInterval(beat, 4000);
    return () => clearInterval(hb);
  }, [roomCode, myId, myName]);

  const showNotif = (title, body) => { setNotif({title,body}); setTimeout(() => setNotif(null), 3500); };

  const createRoom = () => {
    if (!nameIn.trim()) return;
    const name = nameIn.trim(); setMyName(name);
    const code = genCode();
    db.set(`cx_${code}`, { messages:[], members:[{id:myId,name,lastSeen:nowTs()}], files:[], reactions:{}, call:null });
    setRoomCode(code); setMessages([]); setMembers([{id:myId,name,lastSeen:nowTs()}]);
    setScreen("room"); showNotif("✅ Room Bana!", `Code: ${code}`);
  };

  const joinRoom = () => {
    if (!nameIn.trim() || codeIn.length < 4) return;
    const name = nameIn.trim(); setMyName(name);
    const code = codeIn.trim().toUpperCase();
    const data = db.get(`cx_${code}`);
    if (!data) { showNotif("❌ Error", "Room nahi mila!"); return; }
    setRoomCode(code); setMessages(data.messages||[]); setPrevLen((data.messages||[]).length);
    setMembers(data.members||[]); setSharedFiles(data.files||[]); setReactions(data.reactions||{});
    setScreen("room"); showNotif("🎉 Joined!", `Welcome ${name}!`);
  };

  const sendMsg = useCallback(() => {
    if (!inputMsg.trim()) return;
    const msg = { id:genId(), senderId:myId, senderName:myName, text:inputMsg.trim(), type:"text", ts:nowTs(), replyTo:reply||null };
    const data = db.get(`cx_${roomCode}`) || { messages:[], members:[], files:[], reactions:{}, call:null };
    data.messages = [...(data.messages||[]), msg];
    db.set(`cx_${roomCode}`, data);
    setMessages([...data.messages]); setPrevLen(data.messages.length);
    setInputMsg(""); setReply(null); setShowEmoji(false);
  }, [inputMsg, myId, myName, roomCode, reply]);

  const handleFile = (file) => {
    if (!file) return;
    if (file.size > 2*1024*1024) { showNotif("⚠️ Badi file", "2MB se chhoti bhejo"); return; }
    const isImg = file.type.startsWith("image/"), isVid = file.type.startsWith("video/");
    const reader = new FileReader();
    reader.onload = e => {
      const msg = { id:genId(), senderId:myId, senderName:myName, text:"",
        type:isImg?"image":isVid?"video":"file", fileName:file.name, fileSize:file.size,
        fileData:e.target.result, ts:nowTs(), replyTo:reply||null };
      const data = db.get(`cx_${roomCode}`) || { messages:[], members:[], files:[], reactions:{}, call:null };
      data.messages = [...(data.messages||[]), msg];
      data.files = [...(data.files||[]), { id:msg.id, name:file.name, size:file.size, data:e.target.result, type:file.type, senderName:myName, ts:nowTs() }];
      db.set(`cx_${roomCode}`, data);
      setMessages([...data.messages]); setPrevLen(data.messages.length); setSharedFiles(data.files);
    };
    reader.readAsDataURL(file);
  };

  const startCall = async (type) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(type==="video"?{audio:true,video:true}:{audio:true,video:false});
      streamRef.current = stream;
      if (vidSelfRef.current && type==="video") { vidSelfRef.current.srcObject=stream; vidSelfRef.current.play().catch(()=>{}); }
      setCallState({type,active:true,muted:false,camOff:false,sharing:false});
      const data = db.get(`cx_${roomCode}`) || {};
      db.set(`cx_${roomCode}`, {...data, call:{callerId:myId,callerName:myName,type,ts:nowTs()}});
    } catch { setCallState({type,active:true,muted:false,camOff:true,sharing:false}); showNotif("📵","Camera/mic allow karo"); }
  };

  const startScreen = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({video:true});
      if (vidSelfRef.current) { vidSelfRef.current.srcObject=stream; vidSelfRef.current.play().catch(()=>{}); }
      setCallState(s => ({...s, sharing:true})); showNotif("🖥️","Screen share shuru!");
    } catch { showNotif("⚠️","Cancel kiya"); }
  };

  const endCall = () => {
    streamRef.current?.getTracks().forEach(t=>t.stop()); streamRef.current=null; setCallState(null);
    const data = db.get(`cx_${roomCode}`) || {};
    db.set(`cx_${roomCode}`, {...data, call:null});
  };

  const addReaction = (msgId, emoji) => {
    const data = db.get(`cx_${roomCode}`) || {};
    const r = data.reactions || {};
    if (!r[msgId]) r[msgId] = {};
    if (!r[msgId][emoji]) r[msgId][emoji] = [];
    if (!r[msgId][emoji].includes(myId)) r[msgId][emoji] = [...r[msgId][emoji], myId];
    data.reactions = r;
    db.set(`cx_${roomCode}`, data);
    setReactions({...r}); setReactFor(null);
  };

  const leaveRoom = () => {
    const data = db.get(`cx_${roomCode}`) || {};
    if (data.members) data.members = data.members.filter(m => m.id !== myId);
    db.set(`cx_${roomCode}`, data);
    streamRef.current?.getTracks().forEach(t=>t.stop());
    setRoomCode(""); setMessages([]); setMembers([]); setSharedFiles([]);
    setCallState(null); setPrevLen(0); setTab("chat"); setScreen("home");
  };

  const copyLink = () => {
    const link = `${window.location.origin}?join=${roomCode}`;
    navigator.clipboard.writeText(link).catch(()=>{});
    setCopied(true); setTimeout(()=>setCopied(false),2000);
    showNotif("📋 Link Copy!","Dosto ko bhejo!");
  };

  const fmtCall = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  const onlineCt = members.filter(m => nowTs()-m.lastSeen<12000).length;

  if (screen==="splash") return (
    <div style={{height:"100vh",background:"#0A0A1A",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap" rel="stylesheet"/>
      {[200,350,500].map((s,i)=>(
        <div key={i} style={{position:"absolute",width:s,height:s,borderRadius:"50%",border:"1px solid rgba(102,126,234,0.15)",animation:`expand 2s ${i*0.4}s ease-out infinite`}}/>
      ))}
      <div style={{position:"relative",zIndex:2,textAlign:"center"}}>
        <div style={{width:80,height:80,borderRadius:22,background:"linear-gradient(135deg,#667eea,#764ba2)",margin:"0 auto 20px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:40,boxShadow:"0 0 60px rgba(102,126,234,0.5)"}}>⚡</div>
        <div style={{fontSize:38,fontWeight:900,background:"linear-gradient(135deg,#667eea,#48bb78)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:-2}}>ConnectX</div>
        <div style={{color:"rgba(255,255,255,0.4)",marginTop:8,fontSize:13,letterSpacing:1}}>CODE SE CONNECT • ZERO NUMBER</div>
        <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:40}}>
          {[0,1,2,3].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:"#667eea",animation:`dot 1.4s ${i*0.15}s ease-in-out infinite`}}/>)}
        </div>
      </div>
      <style>{`@keyframes expand{0%{transform:scale(0.8);opacity:0.6}100%{transform:scale(1.6);opacity:0}}@keyframes dot{0%,80%,100%{transform:scale(0.6);opacity:0.3}40%{transform:scale(1);opacity:1}}`}</style>
    </div>
  );

  if (screen==="home") return (
    <div style={{height:"100vh",background:"#0A0A1A",fontFamily:"'Outfit',sans-serif",overflowY:"auto"}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap" rel="stylesheet"/>
      {notif&&<Notif n={notif}/>}
      <div style={{maxWidth:480,margin:"0 auto",padding:"32px 20px 40px"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:68,height:68,borderRadius:18,background:"linear-gradient(135deg,#667eea,#764ba2)",margin:"0 auto 14px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,boxShadow:"0 8px 32px rgba(102,126,234,0.4)"}}>⚡</div>
          <div style={{fontSize:30,fontWeight:900,color:"white",letterSpacing:-1}}>ConnectX</div>
          <div style={{color:"rgba(255,255,255,0.4)",fontSize:13,marginTop:6}}>Kisi se bhi baat karo — sirf ek code se</div>
        </div>
        <div style={{color:"rgba(255,255,255,0.5)",fontSize:12,fontWeight:600,letterSpacing:0.5,marginBottom:8}}>APNA NAAM</div>
        <div style={{background:"rgba(255,255,255,0.05)",borderRadius:14,padding:"0 16px",display:"flex",alignItems:"center",gap:10,border:"1px solid rgba(255,255,255,0.08)",marginBottom:14}}>
          <span style={{fontSize:18,opacity:0.6}}>👤</span>
          <input value={nameIn} onChange={e=>setNameIn(e.target.value)} placeholder="Naam likhein..." onKeyDown={e=>e.key==="Enter"&&createRoom()} style={{flex:1,background:"transparent",border:"none",outline:"none",color:"white",fontSize:16,fontFamily:"'Outfit',sans-serif",padding:"14px 0"}}/>
        </div>
        <button onClick={createRoom} disabled={!nameIn.trim()} style={{width:"100%",padding:16,background:nameIn.trim()?"linear-gradient(135deg,#667eea,#764ba2)":"rgba(255,255,255,0.05)",borderRadius:14,border:"none",color:"white",fontSize:16,fontWeight:700,cursor:nameIn.trim()?"pointer":"not-allowed",marginBottom:6,fontFamily:"'Outfit',sans-serif"}}>✨ Naya Room Banao</button>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.25)",textAlign:"center",marginBottom:20}}>Room banao → code milega → dosto ko link bhejo</div>
        <div style={{display:"flex",alignItems:"center",gap:12,margin:"16px 0"}}>
          <div style={{flex:1,height:1,background:"rgba(255,255,255,0.08)"}}/>
          <span style={{color:"rgba(255,255,255,0.25)",fontSize:12}}>YA CODE DAALO</span>
          <div style={{flex:1,height:1,background:"rgba(255,255,255,0.08)"}}/>
        </div>
        <div style={{color:"rgba(255,255,255,0.5)",fontSize:12,fontWeight:600,letterSpacing:0.5,marginBottom:8}}>ROOM CODE</div>
        <div style={{background:"rgba(255,255,255,0.05)",borderRadius:14,padding:"0 16px",display:"flex",alignItems:"center",gap:10,border:"1px solid rgba(255,255,255,0.08)",marginBottom:14}}>
          <span style={{fontSize:18,opacity:0.6}}>🔑</span>
          <input value={codeIn} onChange={e=>setCodeIn(e.target.value.toUpperCase())} placeholder="Jaise: AB3X9K" maxLength={6} onKeyDown={e=>e.key==="Enter"&&joinRoom()} style={{flex:1,background:"transparent",border:"none",outline:"none",color:"white",fontSize:16,fontFamily:"'Outfit',sans-serif",padding:"14px 0",letterSpacing:3}}/>
        </div>
        <button onClick={joinRoom} disabled={!nameIn.trim()||codeIn.length<4} style={{width:"100%",padding:16,background:(nameIn.trim()&&codeIn.length>=4)?"linear-gradient(135deg,#48bb78,#38a169)":"rgba(255,255,255,0.05)",borderRadius:14,border:"none",color:"white",fontSize:16,fontWeight:700,cursor:(nameIn.trim()&&codeIn.length>=4)?"pointer":"not-allowed",fontFamily:"'Outfit',sans-serif"}}>🚀 Room Join Karo</button>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:28}}>
          {[["💬","Chat","Text, Emoji, Reply"],["📸","Media","Photo & Video"],["📹","Video Call","HD face-to-face"],["🖥️","Screen Share","Screen dikhao"],["📞","Audio Call","Sirf awaaz"],["📁","Files","Koi bhi file"]].map(([ic,ti,de])=>(
            <div key={ti} style={{background:"rgba(255,255,255,0.04)",borderRadius:14,padding:"14px 12px",border:"1px solid rgba(255,255,255,0.07)"}}>
              <div style={{fontSize:22,marginBottom:5}}>{ic}</div>
              <div style={{color:"white",fontSize:13,fontWeight:700}}>{ti}</div>
              <div style={{color:"rgba(255,255,255,0.35)",fontSize:11,marginTop:2}}>{de}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{height:"100vh",background:"#0D0D1F",fontFamily:"'Outfit',sans-serif",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap" rel="stylesheet"/>
      {notif&&<Notif n={notif}/>}
      {incoming&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#1A1A30",borderRadius:24,padding:36,textAlign:"center",width:300,border:"1px solid rgba(255,255,255,0.1)"}}>
            <div style={{width:80,height:80,borderRadius:"50%",background:avColor(incoming.callerName),margin:"0 auto 16px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,color:"white"}}>{incoming.callerName?.[0]?.toUpperCase()}</div>
            <div style={{color:"white",fontSize:20,fontWeight:700}}>{incoming.callerName}</div>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:13,margin:"6px 0 24px"}}>{incoming.type==="video"?"📹 Video":"📞 Audio"} call aa rahi hai...</div>
            <div style={{display:"flex",gap:14,justifyContent:"center"}}>
              <button onClick={()=>{setIncoming(null);showNotif("📵","Decline kiya");}} style={{padding:"12px 24px",background:"#EF4444",borderRadius:14,border:"none",color:"white",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>📵 Decline</button>
              <button onClick={()=>{setIncoming(null);startCall(incoming.type);}} style={{padding:"12px 24px",background:"#22C55E",borderRadius:14,border:"none",color:"white",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>✅ Accept</button>
            </div>
          </div>
        </div>
      )}
      {callState&&(
        <div style={{position:"fixed",inset:0,background:"#050510",zIndex:5000,display:"flex",flexDirection:"column"}}>
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",background:"#0A0A1A"}}>
            {callState.type==="video"&&!callState.camOff?(<video ref={vidSelfRef} autoPlay muted playsInline style={{width:"100%",height:"100%",objectFit:"cover"}}/>):(
              <div style={{textAlign:"center"}}>
                <div style={{width:90,height:90,borderRadius:"50%",background:"linear-gradient(135deg,#667eea,#764ba2)",margin:"0 auto 16px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:40}}>
                  {callState.type==="video"?"📹":"📞"}
                </div>
                <div style={{color:"white",fontSize:22,fontWeight:700}}>{members.find(m=>m.id!==myId)?.name||"Dost"}</div>
                <div style={{color:"rgba(255,255,255,0.5)",marginTop:8,fontSize:18}}>{fmtCall(callSecs)}</div>
              </div>
            )}
            {callState.sharing&&<div style={{position:"absolute",top:16,left:"50%",transform:"translateX(-50%)",background:"#EF4444",borderRadius:20,padding:"6px 16px",color:"white",fontSize:13,fontWeight:600}}>🔴 Screen Share Live</div>}
          </div>
          <div style={{background:"rgba(0,0,0,0.9)",padding:"20px 0 36px",display:"flex",gap:20,justifyContent:"center",alignItems:"center"}}>
            {[
              {icon:callState.muted?"🔇":"🎤",label:callState.muted?"Unmute":"Mute",onClick:()=>setCallState(s=>({...s,muted:!s.muted})),active:callState.muted},
              ...(callState.type==="video"?[{icon:callState.camOff?"📷":"📹",label:callState.camOff?"Cam On":"Cam Off",onClick:()=>setCallState(s=>({...s,camOff:!s.camOff})),active:callState.camOff}]:[]),
              {icon:"🖥️",label:"Screen",onClick:startScreen,active:callState.sharing,color:"#667eea"},
              {icon:"🔴",label:"End",onClick:endCall,color:"#EF4444",big:true}
            ].map((b,i)=>(
              <div key={i} onClick={b.onClick} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,cursor:"pointer"}}>
                <div style={{width:b.big?64:52,height:b.big?64:52,borderRadius:"50%",background:b.active?(b.color||"rgba(255,255,255,0.2)"):(b.color?b.color+"33":"rgba(255,255,255,0.1)"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:b.big?28:22}}>
                  {b.icon}
                </div>
                <span style={{color:"rgba(255,255,255,0.5)",fontSize:11}}>{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{background:"rgba(255,255,255,0.03)",borderBottom:"1px solid rgba(255,255,255,0.07)",padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#667eea,#764ba2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>⚡</div>
        <div style={{flex:1}}>
          <div style={{color:"white",fontWeight:700,fontSize:14}}>ConnectX</div>
          <div style={{color:"rgba(255,255,255,0.4)",fontSize:11}}>{onlineCt} online</div>
        </div>
        <div onClick={copyLink} style={{background:"rgba(102,126,234,0.15)",border:"1px solid rgba(102,126,234,0.3)",borderRadius:20,padding:"6px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
          <span style={{color:"#a78bfa",fontSize:12,fontWeight:700,letterSpacing:1}}>{roomCode}</span>
          <span style={{fontSize:12}}>{copied?"✅":"📋"}</span>
        </div>
        {[["📞",()=>startCall("audio")],["📹",()=>startCall("video")],["🚪",leaveRoom]].map(([ic,fn],i)=>(
          <button key={i} onClick={fn} style={{width:34,height:34,borderRadius:10,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.08)",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>{ic}</button>
        ))}
      </div>
      <div style={{display:"flex",background:"rgba(255,255,255,0.02)",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
        {[["chat","💬 Chat"],["members",`👥 Members`],["files","📁 Files"]].map(([t,l])=>(
          <div key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"11px 0",textAlign:"center",cursor:"pointer",borderBottom:tab===t?"2px solid #667eea":"2px solid transparent",color:tab===t?"#a78bfa":"rgba(255,255,255,0.4)",fontSize:13,fontWeight:600}}>
            {l}{t==="members"&&onlineCt>0&&<span style={{marginLeft:4,background:"#22C55E",borderRadius:"50%",padding:"1px 5px",fontSize:10,color:"white"}}>{onlineCt}</span>}
          </div>
        ))}
      </div>
      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
        {tab==="chat"&&(
          <>
            <div style={{flex:1,overflowY:"auto",padding:"14px 14px 8px"}} onClick={()=>setReactFor(null)}>
              {messages.length===0&&(
                <div style={{textAlign:"center",padding:"50px 20px",color:"rgba(255,255,255,0.3)"}}>
                  <div style={{fontSize:50,marginBottom:10}}>💬</div>
                  <div style={{fontSize:15,fontWeight:600}}>Pehli message bhejo!</div>
                  <div style={{fontSize:12,marginTop:6}}>Code share karo: <span style={{color:"#a78bfa",fontWeight:700}}>{roomCode}</span></div>
                </div>
              )}
              {messages.map((msg,idx)=>{
                const isMe = msg.senderId===myId;
                const showName = !isMe&&(idx===0||messages[idx-1]?.senderId!==msg.senderId);
                const msgR = reactions[msg.id]||{};
                return (
                  <div key={msg.id} style={{marginBottom:6,display:"flex",flexDirection:"column",alignItems:isMe?"flex-end":"flex-start"}}>
                    {showName&&<div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginLeft:8,marginBottom:3,fontWeight:600}}>{msg.senderName}</div>}
                    {msg.replyTo&&<div style={{background:"rgba(255,255,255,0.05)",borderLeft:"3px solid #667eea",borderRadius:8,padding:"4px 10px",marginBottom:3,maxWidth:"70%",fontSize:11,color:"rgba(255,255,255,0.4)"}}>↩ {msg.replyTo.text?.slice(0,50)}</div>}
                    <div onContextMenu={e=>{e.preventDefault();setReactFor(msg.id);}} style={{maxWidth:"75%",background:isMe?"linear-gradient(135deg,#667eea,#764ba2)":"rgba(255,255,255,0.07)",borderRadius:isMe?"18px 18px 4px 18px":"18px 18px 18px 4px",padding:"9px 13px",cursor:"pointer",boxShadow:isMe?"0 4px 16px rgba(102,126,234,0.3)":"none"}}>
                      {msg.type==="image"&&<img src={msg.fileData} alt="" style={{maxWidth:200,borderRadius:10,display:"block",marginBottom:msg.text?6:0}}/>}
                      {msg.type==="video"&&<video src={msg.fileData} controls style={{maxWidth:200,borderRadius:10,display:"block"}}/>}
                      {msg.type==="file"&&(
                        <a href={msg.fileData} download={msg.fileName} style={{display:"flex",alignItems:"center",gap:8,textDecoration:"none"}}>
                          <div style={{width:36,height:36,borderRadius:8,background:"rgba(255,255,255,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📎</div>
                          <div><div style={{color:"white",fontSize:12,fontWeight:600}}>{msg.fileName}</div><div style={{color:"rgba(255,255,255,0.5)",fontSize:11}}>{fmtSize(msg.fileSize)}</div></div>
                        </a>
                      )}
                      {msg.text&&<div style={{color:"white",fontSize:14,lineHeight:1.5}}>{msg.text}</div>}
                      <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginTop:3,textAlign:"right"}}>{fmtTime(msg.ts)}</div>
                    </div>
                    {Object.keys(msgR).length>0&&(
                      <div style={{display:"flex",gap:4,marginTop:3}}>
                        {Object.entries(msgR).map(([e,u])=>(<div key={e} onClick={()=>addReaction(msg.id,e)} style={{background:"rgba(255,255,255,0.08)",borderRadius:12,padding:"2px 8px",fontSize:12,cursor:"pointer"}}>{e} {u.length}</div>))}
                      </div>
                    )}
                    {reactFor===msg.id&&(
                      <div style={{background:"#1A1A30",borderRadius:16,padding:"8px 12px",display:"flex",gap:8,border:"1px solid rgba(255,255,255,0.1)",zIndex:10}}>
                        {["❤️","😂","👍","🔥","😮","😢","🙏","✨"].map(e=>(<span key={e} style={{fontSize:22,cursor:"pointer"}} onClick={()=>addReaction(msg.id,e)}>{e}</span>))}
                      </div>
                    )}
                    <div onClick={()=>setReply({text:msg.text,senderName:msg.senderName})} style={{fontSize:10,color:"rgba(255,255,255,0.2)",cursor:"pointer",marginTop:2}}>↩ Reply</div>
                  </div>
                );
              })}
              <div ref={endRef}/>
            </div>
            {reply&&(
              <div style={{background:"rgba(102,126,234,0.1)",borderLeft:"3px solid #667eea",margin:"0 14px 4px",borderRadius:8,padding:"7px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.5)"}}><b style={{color:"#a78bfa"}}>{reply.senderName}</b>: {reply.text?.slice(0,60)}</div>
                <span onClick={()=>setReply(null)} style={{color:"rgba(255,255,255,0.4)",cursor:"pointer"}}>✕</span>
              </div>
            )}
            {showEmoji&&(
              <div style={{background:"#131326",borderTop:"1px solid rgba(255,255,255,0.07)",padding:"10px 14px",display:"flex",flexWrap:"wrap",gap:6}}>
                {EMOJIS.map(e=>(<span key={e} style={{fontSize:22,cursor:"pointer",padding:"3px 5px",borderRadius:8}} onClick={()=>setInputMsg(p=>p+e)}>{e}</span>))}
              </div>
            )}
            <div style={{background:"rgba(255,255,255,0.02)",borderTop:"1px solid rgba(255,255,255,0.07)",padding:"10px 14px",display:"flex",alignItems:"flex-end",gap:10}}>
              <div style={{flex:1,background:"rgba(255,255,255,0.06)",borderRadius:24,padding:"9px 14px",display:"flex",alignItems:"center",gap:8,border:"1px solid rgba(255,255,255,0.08)"}}>
                <span style={{cursor:"pointer",fontSize:18,opacity:0.7}} onClick={()=>setShowEmoji(!showEmoji)}>😊</span>
                <input placeholder="Message likhein..." value={inputMsg} onChange={e=>setInputMsg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendMsg()} style={{flex:1,background:"transparent",border:"none",outline:"none",color:"white",fontSize:15,fontFamily:"'Outfit',sans-serif"}}/>
                <input type="file" ref={fileRef} style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])} accept="image/*,video/*,*/*"/>
                <span style={{cursor:"pointer",fontSize:18,opacity:0.7}} onClick={()=>fileRef.current?.click()}>📎</span>
              </div>
              <button onClick={sendMsg} style={{width:44,height:44,borderRadius:"50%",background:inputMsg.trim()?"linear-gradient(135deg,#667eea,#764ba2)":"rgba(255,255,255,0.07)",border:"none",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:inputMsg.trim()?"0 4px 16px rgba(102,126,234,0.4)":"none"}}>
                {inputMsg.trim()?"➤":"🎤"}
              </button>
            </div>
          </>
        )}
        {tab==="members"&&(
          <div style={{flex:1,overflowY:"auto",padding:16}}>
            {members.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:"rgba(255,255,255,0.3)"}}>Koi online nahi</div>}
            {members.map(m=>{
              const online = nowTs()-m.lastSeen<12000;
              return (
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:"rgba(255,255,255,0.03)",borderRadius:14,marginBottom:8,border:"1px solid rgba(255,255,255,0.06)"}}>
                  <div style={{position:"relative"}}>
                    <div style={{width:44,height:44,borderRadius:"50%",background:avColor(m.name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700,color:"white"}}>{m.name?.[0]?.toUpperCase()}</div>
                    <div style={{position:"absolute",bottom:0,right:0,width:12,height:12,borderRadius:"50%",background:online?"#22C55E":"#6B7280",border:"2px solid #0D0D1F"}}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{color:"white",fontWeight:600,fontSize:14}}>{m.name}{m.id===myId&&<span style={{fontSize:11,color:"#a78bfa",marginLeft:6}}>(Aap)</span>}</div>
                    <div style={{color:"rgba(255,255,255,0.4)",fontSize:12}}>{online?"🟢 Online":"⚫ Offline"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {tab==="files"&&(
          <div style={{flex:1,overflowY:"auto",padding:16}}>
            {sharedFiles.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:"rgba(255,255,255,0.3)"}}>
              <div style={{fontSize:40,marginBottom:10}}>📁</div>
              <div>Koi file share nahi ki</div>
              <div style={{fontSize:12,marginTop:4}}>Chat mein 📎 se bhejo</div>
            </div>}
            {sharedFiles.map(f=>(
              <a key={f.id} href={f.data} download={f.name} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:"rgba(255,255,255,0.03)",borderRadius:14,marginBottom:8,border:"1px solid rgba(255,255,255,0.06)",textDecoration:"none"}}>
                {f.type?.startsWith("image/")?<img src={f.data} style={{width:44,height:44,borderRadius:10,objectFit:"cover"}} alt=""/>:<div style={{width:44,height:44,borderRadius:10,background:"rgba(102,126,234,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>📎</div>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:"white",fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                  <div style={{color:"rgba(255,255,255,0.4)",fontSize:11}}>{fmtSize(f.size)} • {f.senderName}</div>
                </div>
                <span style={{fontSize:18}}>⬇️</span>
              </a>
            ))}
          </div>
        )}
      </div>
      <style>{`*{box-sizing:border-box}::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px}`}</style>
    </div>
  );
}

function Notif({n}) {
  return (
    <div style={{position:"fixed",top:16,right:16,zIndex:99999,background:"rgba(20,20,40,0.95)",backdropFilter:"blur(20px)",borderRadius:16,padding:"12px 16px",maxWidth:280,border:"1px solid rgba(255,255,255,0.1)",boxShadow:"0 8px 32px rgba(0,0,0,0.4)",display:"flex",gap:12,alignItems:"center",animation:"slideIn 0.3s ease",fontFamily:"'Outfit',sans-serif"}}>
      <div style={{fontSize:26}}>🔔</div>
      <div>
        <div style={{fontWeight:700,fontSize:13,color:"white"}}>{n.title}</div>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginTop:2}}>{n.body}</div>
      </div>
      <style>{`@keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  );
  }
