"use client";
import {useEffect} from "react";
import {useRouter} from "next/navigation";
export default function AutoRefresh(){
  const router=useRouter();
  useEffect(()=>{const timer=setInterval(()=>router.refresh(),30000);return()=>clearInterval(timer)},[router]);
  return <span className="badge">Actualización automática cada 30 segundos</span>;
}
