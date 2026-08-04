"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import LogoutButton from "./LogoutButton";
import TechnicalSupport from "./TechnicalSupport";
import ExperienceTools from "./ExperienceTools";

export default function AppChrome({children,nav,active,unread,user}){
  const [collapsed,setCollapsed]=useState(false);
  useEffect(()=>{
    setCollapsed(localStorage.getItem("irtra-menu-collapsed")==="true");
    let active=true;
    const verify=async()=>{
      try{
        const response=await fetch("/api/auth/session",{cache:"no-store"});
        if(active&&response.status===401) window.location.replace("/login?reason=session-replaced");
      }catch{}
    };
    const timer=setInterval(verify,10000);
    const onFocus=()=>verify();
    window.addEventListener("focus",onFocus);
    verify();
    return()=>{active=false;clearInterval(timer);window.removeEventListener("focus",onFocus)};
  },[]);
  function toggle(){
    setCollapsed(value=>{const next=!value;localStorage.setItem("irtra-menu-collapsed",String(next));return next});
  }
  return <div className={`shell ${collapsed?"collapsed":""}`}>
    <aside className="sidebar">
      <div className="brand"><div className="brandmark brandmark-logo"><img src="/images/logo-los-hostales.webp" alt="Los Hostales del IRTRA" /></div><div className="brand-copy"><b>IRTRA</b><small>Encuestas y servicio</small></div></div>
      <nav className="nav">{nav.map(([href,icon,label])=><Link className={active===href?"active":""} href={href} key={href} title={collapsed?label:undefined}><span>{icon}</span><em>{label}</em>{href==="/alertas"&&unread>0&&<span className="nav-count">{unread>99?"99+":unread}</span>}</Link>)}</nav>
    </aside>
    <main className="main">
      <header className="topbar">
        <div className="topbar-start"><button className="menu-toggle" onClick={toggle} aria-label={collapsed?"Mostrar menú":"Ocultar menú"} aria-expanded={!collapsed}><span></span><span></span><span></span></button><div><b>Gestión de encuestas</b><div className="muted topbar-caption">Guardado automático</div></div></div>
        <div className="topbar-user"><ExperienceTools/><div className="topbar-user-data"><b>{user?.name}</b><div className="muted topbar-caption">{user?.role==="admin"?"Administrador":"Verificador"}</div></div><TechnicalSupport user={user}/><LogoutButton/></div>
      </header>
      <section className="content" id="main-content" tabIndex="-1">{children}</section>
    </main>
  </div>;
}
