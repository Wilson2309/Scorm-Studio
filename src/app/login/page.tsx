import {AuthPage} from "@/features/auth/auth-page";
export const metadata = { title: "Bienvenido" };
export default function Page({searchParams}:PageProps<"/login">){return <AuthPage mode="login" searchParams={searchParams}/>;}
