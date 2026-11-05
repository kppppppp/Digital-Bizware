import { ProductPage } from "@/components/store";
export default async function Page({params}:{params:Promise<{slug:string}>}){const p=await params;return <ProductPage slug={p.slug}/>}
