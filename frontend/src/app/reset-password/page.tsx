import { ResetPage } from "@/components/store";
export default async function Page({searchParams}:{searchParams:Promise<{token?:string}>}){const p=await searchParams;return <ResetPage token={p.token||""}/>}
