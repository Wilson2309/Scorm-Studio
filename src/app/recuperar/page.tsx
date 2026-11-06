import {AuthPage} from "@/features/auth/auth-page";
export const metadata={title:"Recuperar acceso"};
export default function Page({searchParams}:PageProps<"/recuperar">){return <AuthPage mode="recover" searchParams={searchParams}/>;}
