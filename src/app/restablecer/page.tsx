import {AuthPage} from "@/features/auth/auth-page";
export const metadata={title:"Restablecer contraseña"};
export default function Page({searchParams}:PageProps<"/restablecer">){return <AuthPage mode="reset" searchParams={searchParams}/>;}
