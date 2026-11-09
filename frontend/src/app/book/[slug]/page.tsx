import { ProductPage } from "@/components/store";
import { API, coverUrl } from "@/lib/api";
import type { BookRecord } from "@classes/shared";
import type { Metadata } from "next";

export const revalidate = 60;

async function getBook(slug: string): Promise<BookRecord | null> {
  try {
    const res = await fetch(`${API}/books/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const p = await params;
  const book = await getBook(p.slug);
  if (!book) return { title: "eBook Details — DIGITAL BIZWARE" };
  return {
    title: `${book.title} — DIGITAL BIZWARE`,
    description: book.description?.slice(0, 160) || "Comprehensive practical field guide.",
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const p = await params;
  const book = await getBook(p.slug);
  const cover = book ? coverUrl(book) : null;

  return (
    <>
      {cover && (
        <link
          rel="preload"
          as="image"
          href={cover}
          fetchPriority="high"
        />
      )}
      <ProductPage slug={p.slug} initialBook={book} />
    </>
  );
}
