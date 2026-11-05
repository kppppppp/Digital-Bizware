import { CataloguePage } from "@/components/store";
export default async function Page({params}:{params:Promise<{category:string}>}){const p=await params;return <CataloguePage categorySlug={p.category}/>}
