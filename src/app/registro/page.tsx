import {AuthPage} from "@/features/auth/auth-page";
export const metadata={title:"Crear cuenta"};
export default function Page({searchParams}:PageProps<"/registro">){return <AuthPage mode="register" searchParams={searchParams}/>;}
