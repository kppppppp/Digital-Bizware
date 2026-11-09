import { HomePage } from "@/components/store";
import type { BookRecord } from "@classes/shared";
import { API, coverUrl } from "@/lib/api";
import type { Metadata } from "next";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "DIGITAL BIZWARE — Knowledge That Moves You Forward",
  description:
    "Discover digital books, practical guides and valuable learning resources designed to help you grow, learn and achieve more.",
};

async function getInitialCatalog(): Promise<{ books: BookRecord[]; fresh: BookRecord[] }> {
  try {
    const [booksRes, freshRes] = await Promise.allSettled([
      fetch(`${API}/books?limit=24`, {
        next: { revalidate: 60 },
        headers: { "Content-Type": "application/json" },
      }),
      fetch(`${API}/books?limit=4&tag=New&sort=newest`, {
        next: { revalidate: 60 },
        headers: { "Content-Type": "application/json" },
      }),
    ]);

    let books: BookRecord[] = [];
    let fresh: BookRecord[] = [];

    if (booksRes.status === "fulfilled" && booksRes.value.ok) {
      const data = await booksRes.value.json().catch(() => null);
      if (data?.items && Array.isArray(data.items)) {
        books = data.items;
      }
    }

    if (freshRes.status === "fulfilled" && freshRes.value.ok) {
      const data = await freshRes.value.json().catch(() => null);
      if (data?.items && Array.isArray(data.items)) {
        fresh = data.items;
      }
    }

    return { books, fresh };
  } catch {
    return { books: [], fresh: [] };
  }
}

export default async function Page() {
  const { books, fresh } = await getInitialCatalog();

  // Determine the first bestseller cover to preload for optimal LCP
  const tagged = books.filter(b => b.tag === "Bestseller");
  const bestsellers = tagged.length >= 2 ? tagged : books.slice(0, 6);
  const firstCover = bestsellers[0] ? coverUrl(bestsellers[0]) : null;

  return (
    <>
      {firstCover && (
        <link
          rel="preload"
          as="image"
          href={firstCover}
          fetchPriority="high"
        />
      )}
      <HomePage initialBooks={books} initialFresh={fresh} />
    </>
  );
}
