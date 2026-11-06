"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { createContext, useContext, useEffect, useMemo, useState, useRef, Suspense } from "react";
import type { BookRecord, Category } from "@classes/shared";
import { api, getBooks, money, coverUrl, API, setAuthToken, clearAuthToken } from "@/lib/api";

type Cart = {
  items: BookRecord[];
  add: (b: BookRecord) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const CartContext = createContext<Cart | null>(null);

export const subjects: [Category, string][] = [
  ["Digital Marketing", "Strategy, campaigns, SEO & organic growth"],
  ["Computer Courses", "Spreadsheet mastery, data modeling & automation"],
  ["English Speaking", "Fluency, professional vocabulary & executive speech"],
  ["IT courses", "Cyber security, defensive networks & ethical hacking"],
  ["Graphic Design", "Brand identity, creative direction & visual UI"],
];

export function useCart() {
  const c = useContext(CartContext);
  if (!c) throw new Error("Cart provider missing");
  return c;
}

function CursorFollower() {
  const ballRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(pointer: coarse)").matches) {
      return;
    }

    let targetX = -100;
    let targetY = -100;
    let currentX = -100;
    let currentY = -100;
    let animId: number;
    let isVisible = false;

    const onMouseMove = (e: MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
      if (!isVisible && ballRef.current) {
        isVisible = true;
        ballRef.current.style.opacity = "1";
      }

      const target = e.target as HTMLElement | null;
      if (
        target &&
        target.closest(
          "a, button, input, select, textarea, .btn, .cat, .store-card, [role='button'], .slideshow-arrow-btn, .slideshow-dot"
        )
      ) {
        ballRef.current?.classList.add("hovered");
      } else {
        ballRef.current?.classList.remove("hovered");
      }
    };

    const onMouseLeave = () => {
      isVisible = false;
      if (ballRef.current) ballRef.current.style.opacity = "0";
    };

    const onMouseEnter = () => {
      isVisible = true;
      if (ballRef.current) ballRef.current.style.opacity = "1";
    };

    const loop = () => {
      currentX += (targetX - currentX) * 0.18;
      currentY += (targetY - currentY) * 0.18;
      if (ballRef.current) {
        ballRef.current.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) translate(-50%, -50%)`;
      }
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    document.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("mouseenter", onMouseEnter);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("mouseenter", onMouseEnter);
    };
  }, []);

  return (
    <div
      ref={ballRef}
      className="cursor-ball"
      style={{ opacity: 0 }}
      aria-hidden="true"
    />
  );
}

function HeroBlueDecoration() {
  return (
    <div className="hero-blue-decoration-wrap" aria-hidden="true">
      <svg
        className="hero-blue-svg"
        viewBox="0 0 240 560"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="blueRibbonGrad" x1="0%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#0284C7" stopOpacity="0.85" />
            <stop offset="25%" stopColor="#2563EB" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#38BDF8" stopOpacity="1" />
            <stop offset="85%" stopColor="#1D4ED8" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0.6" />
          </linearGradient>
          <filter id="blueRibbonGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.5" result="glow" />
            <feComposite in="SourceGraphic" in2="glow" operator="over" />
          </filter>
        </defs>

        {/* Dynamic Spiraling Ribbon (Sprite Genix Inspired Decoration) */}
        <path
          className="blue-ribbon-path"
          d="M -15,25 C 55,20 100,70 85,145 C 72,215 22,235 28,285 C 34,335 90,340 100,290 C 108,245 46,240 40,295 C 34,345 110,355 120,305 C 128,255 72,250 68,305 C 62,365 105,410 92,470 C 78,530 28,580 5,630"
          stroke="url(#blueRibbonGrad)"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#blueRibbonGlow)"
        />

        {/* Ambient Glowing Particle Accents */}
        <circle className="blue-bead bead-1" cx="100" cy="290" r="3.5" fill="#38BDF8" />
        <circle className="blue-bead bead-2" cx="85" cy="145" r="2.5" fill="#60A5FA" opacity="0.85" />
        <circle className="blue-bead bead-3" cx="92" cy="470" r="3" fill="#0EA5E9" opacity="0.75" />
        <circle className="blue-ring ring-1" cx="120" cy="305" r="7" stroke="#38BDF8" strokeWidth="1.2" opacity="0.4" />
      </svg>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<BookRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [menu, setMenu] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    try {
      setItems(JSON.parse(localStorage.getItem("classes-cart") || "[]"));
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem("classes-cart", JSON.stringify(items));
  }, [items, ready]);

  useEffect(() => {
    setMenu(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    api<any>("/auth/me")
      .then(res => setUser(res.user))
      .catch(() => setUser(null));
  }, [pathname]);

  const cart = useMemo(
    () => ({
      items,
      add: (b: BookRecord) =>
        setItems(old => (old.some(x => x._id === b._id) ? old : [...old, b])),
      remove: (id: string) => setItems(old => old.filter(x => x._id !== id)),
      clear: () => setItems([]),
    }),
    [items]
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/explore?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
    }
  };

  return (
    <CartContext.Provider value={cart}>
      {/* Interactive Yellow Half-Opaque Cursor Follower Ball */}
      <CursorFollower />

      {/* Top Notification Bar */}
      <div className="topnote">
        <span className="spark">⚡</span>
        <span>PREMIUM DIGITAL EDITIONS & PRACTICAL EBOOKS · INSTANT LIFETIME ACCESS</span>
      </div>

      {/* Main Navbar */}
      <header className="header">
        <div className="wrap nav">
          <Link className="brand" href="/" aria-label="Digital Bizware Home">
            <img className="brand-logo-img" src="/assets/logo.png" alt="Digital Bizware Logo" />
            <div className="brand-text-wrap">
              <span className="brand-name">
                DIGITAL <span>BIZWARE</span>
              </span>
              <span className="brand-tagline">Knowledge Marketplace</span>
            </div>
          </Link>

          <nav className="navlinks">
            <Link href="/" className={pathname === "/" ? "active" : ""}>
              Home
            </Link>
            <Link href="/explore" className={pathname === "/explore" ? "active" : ""}>
              Explore eBooks
            </Link>
            <Link href="/categories" className={pathname === "/categories" ? "active" : ""}>
              Categories
            </Link>
            <Link href="/explore?tag=Bestseller">Bestsellers</Link>
            <Link href="/explore?tag=New">New Arrivals</Link>
            <Link href="/#why-us">Why Us</Link>
          </nav>

          <div className="navtools">
            <button
              className="nav-search-btn"
              onClick={() => setSearchOpen(!searchOpen)}
              aria-label="Search catalog"
            >
              <span className="search-icon">🔍</span>
              <span className="search-text">Search</span>
            </button>

            {user ? (
              <Link className="nav-tool-btn" href="/student">
                <span>My Library</span>
              </Link>
            ) : (
              <Link className="nav-tool-btn" href="/login">
                <span>Sign In</span>
              </Link>
            )}

            <Link className="bag-link" href="/cart" aria-label="Shopping Cart">
              <span className="bag-icon">🛍️</span>
              <span className="bag-text">Cart</span>
              <span className="count">{items.length}</span>
            </Link>

            <button
              className="hamb"
              onClick={() => setMenu(true)}
              aria-label="Open mobile menu"
            >
              ☰
            </button>
          </div>
        </div>

        {/* Search Expansion Dropdown */}
        {searchOpen && (
          <div
            style={{
              background: "#FFFFFF",
              borderTop: "1px solid var(--line)",
              padding: "16px 0",
              boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
            }}
          >
            <div className="wrap">
              <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "10px" }}>
                <input
                  type="text"
                  autoFocus
                  placeholder="Search titles, authors, keywords (e.g. SEO, Excel, Cyber Security)..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "12px 18px",
                    borderRadius: "var(--radius-sm)",
                    border: "2px solid var(--dark)",
                    fontSize: "14.5px",
                    outline: "none",
                  }}
                />
                <button type="submit" className="btn btn-yellow">
                  Search Collection
                </button>
                <button
                  type="button"
                  className="btn outline"
                  onClick={() => setSearchOpen(false)}
                >
                  ✕
                </button>
              </form>
            </div>
          </div>
        )}
      </header>

      {/* Mobile Slide-in Drawer */}
      <div
        className={`mobile-drawer ${menu ? "open" : ""}`}
        onClick={() => setMenu(false)}
      >
        <div
          className="mobile-drawer-content"
          onClick={e => e.stopPropagation()}
        >
          <div className="mobile-drawer-head">
            <Link className="brand" href="/" onClick={() => setMenu(false)}>
              <img className="brand-logo-img" src="/assets/logo.png" alt="" />
              <div className="brand-text-wrap">
                <span className="brand-name">
                  DIGITAL <span>BIZWARE</span>
                </span>
              </div>
            </Link>
            <button
              className="mobile-drawer-close"
              onClick={() => setMenu(false)}
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              placeholder="Search eBooks..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                padding: "10px 14px",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-sm)",
                fontSize: "13.5px",
              }}
            />
            <button type="submit" className="btn small btn-yellow">
              Go
            </button>
          </form>

          <nav className="mobile-drawer-links">
            <Link href="/" onClick={() => setMenu(false)}>
              Home
            </Link>
            <Link href="/explore" onClick={() => setMenu(false)}>
              Explore All eBooks
            </Link>
            <Link href="/categories" onClick={() => setMenu(false)}>
              Categories & Tracks
            </Link>
            <Link href="/explore?tag=Bestseller" onClick={() => setMenu(false)}>
              Bestsellers
            </Link>
            <Link href="/explore?tag=New" onClick={() => setMenu(false)}>
              New Releases
            </Link>
            <Link href="/cart" onClick={() => setMenu(false)}>
              Shopping Cart ({items.length})
            </Link>
            {user ? (
              <Link href="/student" onClick={() => setMenu(false)}>
                My Library Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" onClick={() => setMenu(false)}>
                  Sign In
                </Link>
                <Link href="/register" onClick={() => setMenu(false)}>
                  Create Account
                </Link>
              </>
            )}
          </nav>

          <div style={{ marginTop: "auto", paddingTop: "20px" }}>
            <Link
              href="/explore"
              className="btn btn-yellow"
              style={{ width: "100%" }}
              onClick={() => setMenu(false)}
            >
              Browse Collection
            </Link>
          </div>
        </div>
      </div>

      {children}
      <Footer />
    </CartContext.Provider>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link className="brand" href="/">
              <img className="brand-logo-img" src="/assets/logo.png" alt="Digital Bizware Logo" />
              <div className="brand-text-wrap">
                <span className="brand-name">
                  DIGITAL <span style={{ color: "var(--yellow)" }}>BIZWARE</span>
                </span>
                <span className="brand-tagline">Premium Digital Marketplace</span>
              </div>
            </Link>
            <p>
              Premium digital learning and eBook marketplace empowering modern
              professionals and lifelong learners with actionable, industry-crafted
              knowledge.
            </p>
            <div className="footer-trust-badge">
              <span>🔒 256-Bit SSL Encrypted Checkout</span>
            </div>
          </div>

          <div>
            <h4>Marketplace</h4>
            <div className="footer-links">
              <Link href="/explore">All eBooks</Link>
              <Link href="/categories">Subject Tracks</Link>
              <Link href="/explore?tag=Bestseller">Bestselling Guides</Link>
              <Link href="/explore?tag=New">New Publications</Link>
              <Link href="/#why-us">Why Digital Bizware</Link>
            </div>
          </div>

          <div>
            <h4>Categories</h4>
            <div className="footer-links">
              {subjects.map(([c]) => (
                <Link key={c} href={`/category/${c.toLowerCase().replaceAll(" ", "-")}`}>
                  {c}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h4>Account & Support</h4>
            <div className="footer-links">
              <Link href="/student">My Library</Link>
              <Link href="/login">Customer Sign In</Link>
              <Link href="/register">Create Account</Link>
              <Link href={process.env.NEXT_PUBLIC_ADMIN_URL || "/admin"}>
                Admin Portal
              </Link>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <div>
            © 2026 DIGITAL BIZWARE. All rights reserved. Knowledge That Moves You Forward.
          </div>
          <div className="footer-legal-links">
            <Link href="/explore">Catalogue</Link>
            <Link href="/categories">Disciplines</Link>
            <Link href="/student">Library Access</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function Cover({
  book,
  className = "",
  style,
}: {
  book: Partial<BookRecord>;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`cover shared-cover ${className}`} style={style}>
      <img
        className="cover-art"
        src={coverUrl(book)}
        alt={`${book.title || "Digital Bizware"} eBook cover`}
      />
      {book.tag && <span className="badge">{book.tag}</span>}
      <span className="cover-subject">{book.category || "Digital Edition"}</span>
    </div>
  );
}

function ProductCard({ book }: { book: BookRecord }) {
  const { add, items } = useCart();
  const isInCart = items.some(x => x._id === book._id);

  const discountPercent =
    book.originalPrice && book.sellingPrice < book.originalPrice
      ? Math.round((1 - book.sellingPrice / book.originalPrice) * 100)
      : 0;

  return (
    <article className="store-card">
      <Link href={`/book/${book.slug}`}>
        <Cover book={book} />
      </Link>
      <div className="book-info">
        <div className="book-cat">{book.category}</div>
        <h3>
          <Link href={`/book/${book.slug}`}>{book.title}</Link>
        </h3>
        <p className="book-desc">{book.description}</p>
        <div className="book-meta">
          <span>By {book.author}</span>
          <span className="rating">
            <span className="rating-star">★</span> {Number(book.rating || 4.8).toFixed(1)}
          </span>
        </div>
        <div className="price-row">
          <span className="price">{money(book.sellingPrice)}</span>
          {book.originalPrice > book.sellingPrice && (
            <span className="oldprice">{money(book.originalPrice)}</span>
          )}
          {discountPercent > 0 && (
            <span className="discount-pill">-{discountPercent}%</span>
          )}
        </div>
        <div className="card-actions">
          <Link className="btn outline small" href={`/book/${book.slug}`}>
            View Details
          </Link>
          <button
            className="btn small btn-yellow"
            disabled={!book.availableForPurchase}
            onClick={() => add(book)}
          >
            {!book.availableForPurchase
              ? "Coming Soon"
              : isInCart
              ? "In Bag ✓"
              : "Add to Bag"}
          </button>
        </div>
      </div>
    </article>
  );
}

function ServiceMessage({ error }: { error: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">⚠️</div>
      <h2>Notice: Unable to load catalogue.</h2>
      <p>{error}</p>
      <button className="btn btn-yellow" onClick={() => window.location.reload()}>
        Retry Loading
      </button>
    </div>
  );
}

function useCatalogue(param = "") {
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ok = true;
    setLoading(true);
    getBooks(new URLSearchParams(param))
      .then(d => {
        if (!ok) return;
        setBooks(d.items || []);
        setTotal(d.total || (d.items ? d.items.length : 0));
        setTotalPages(d.totalPages || 1);
      })
      .catch(e => ok && setError(e.message))
      .finally(() => ok && setLoading(false));
    return () => {
      ok = false;
    };
  }, [param]);

  return { books, total, totalPages, loading, error };
}

/* ==========================================================================
   HOMEPAGE COMPONENT
   ========================================================================== */
export function HomePage() {
  const { books, error, loading } = useCatalogue("limit=20");
  const fresh = useCatalogue("limit=4&tag=New&sort=newest").books;
  const { add } = useCart();

  // Real bestseller books from backend
  const bestsellers = useMemo(() => {
    const tagged = books.filter(b => b.tag === "Bestseller");
    if (tagged.length >= 2) return tagged;
    return books.slice(0, 6);
  }, [books]);

  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const transitionToSlide = (newIndex: number) => {
    if (newIndex === activeSlide || isTransitioning) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setActiveSlide(newIndex);
      setIsTransitioning(false);
    }, 280);
  };

  // Auto-advance slideshow smoothly every 4.8 seconds
  useEffect(() => {
    if (bestsellers.length <= 1 || isPaused) return;
    const interval = setInterval(() => {
      transitionToSlide((activeSlide + 1) % bestsellers.length);
    }, 4800);
    return () => clearInterval(interval);
  }, [bestsellers.length, isPaused, activeSlide, isTransitioning]);

  const currentBook = bestsellers[activeSlide] || books[0] || {
    _id: "default",
    slug: "the-complete-digital-marketing-playbook",
    title: "The Complete Digital Marketing Playbook",
    author: "Ananya Mehta",
    category: "Digital Marketing",
    sellingPrice: 549,
    originalPrice: 799,
    rating: 4.9,
    coverImageUrl: "/assets/ebook-cover.png",
    tag: "Bestseller",
  };

  const nextSlide = () => {
    if (!bestsellers.length) return;
    transitionToSlide((activeSlide + 1) % bestsellers.length);
  };

  const prevSlide = () => {
    if (!bestsellers.length) return;
    transitionToSlide((activeSlide - 1 + bestsellers.length) % bestsellers.length);
  };

  const featured = bestsellers.slice(0, 4);
  const featuredBook = currentBook;

  return (
    <main>
      {/* A. IMPACTFUL HERO SECTION WITH BESTSELLER SLIDESHOW */}
      <section className="hero">
        {/* Dynamic Blue String Decoration (Sprite Genix Inspired) */}
        <HeroBlueDecoration />

        <div className="wrap hero-grid">
          <div className="hero-copy">
            <div className="eyebrow">
              <span>★</span> DIGITAL BIZWARE · OFFICIAL 2026 EDITIONS
            </div>
            <h1>
              Knowledge That <span className="highlight">Moves You</span> Forward.
            </h1>
            <p>
              Discover digital books, practical guides and valuable learning
              resources designed to help you grow, learn and achieve more in today’s
              high-growth industries.
            </p>
            <div className="actions">
              <Link className="btn btn-yellow" href="/explore">
                Explore eBooks ↗
              </Link>
              <Link className="btn outline" href="/categories">
                Browse Categories
              </Link>
            </div>
            <div className="hero-proof">
              <div className="hero-proof-item">
                <span className="icon">⚡</span>
                <span>Instant PDF Access</span>
              </div>
              <div className="hero-proof-item">
                <span className="icon">🔒</span>
                <span>Verified Checkout</span>
              </div>
              <div className="hero-proof-item">
                <span className="icon">★</span>
                <span>4.9/5 Reader Rating</span>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE: LARGE YELLOW SHOWCASE & AUTOMATIC BESTSELLER SLIDESHOW */}
          <div
            className="hero-showcase-wrap"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            {/* Substantially Larger Yellow Graphic Panel Tilted 26deg */}
            <div className="hero-yellow-panel" />

            {/* Rotating Bestseller eBook Presentation with Smooth Transition */}
            <div className="hero-slideshow-card">
              <div className={`slideshow-slide ${isTransitioning ? "transitioning-out" : "transitioning-in"}`}>
                <div className="slideshow-cover-box">
                  <Link href={`/book/${currentBook.slug}`}>
                    <Cover book={currentBook} />
                  </Link>
                </div>

                <div className="slideshow-info">
                  <span className="slideshow-pill">
                    ★ {currentBook.tag || "BESTSELLER"} #0{activeSlide + 1}
                  </span>
                  <h3>
                    <Link href={`/book/${currentBook.slug}`}>{currentBook.title}</Link>
                  </h3>
                  <p className="slideshow-author">
                    By <strong>{currentBook.author}</strong> · {currentBook.category}
                  </p>

                  <div className="slideshow-price-row">
                    <span className="slideshow-price">{money(currentBook.sellingPrice)}</span>
                    {currentBook.originalPrice > currentBook.sellingPrice && (
                      <span className="slideshow-oldprice">{money(currentBook.originalPrice)}</span>
                    )}
                  </div>

                  <div className="slideshow-actions">
                    <Link
                      className="btn small btn-yellow"
                      href={`/book/${currentBook.slug}`}
                    >
                      View Book ↗
                    </Link>
                    <button
                      className="btn small outline"
                      onClick={() => add(currentBook)}
                    >
                      Add to Bag
                    </button>
                  </div>
                </div>
              </div>

              {/* Slideshow Previous/Next & Dots Pagination */}
              {bestsellers.length > 1 && (
                <div className="slideshow-footer-nav">
                  <button
                    className="slideshow-arrow-btn"
                    onClick={prevSlide}
                    aria-label="Previous bestseller"
                  >
                    ‹
                  </button>

                  <div className="slideshow-dots">
                    {bestsellers.map((_, i) => (
                      <button
                        key={i}
                        className={`slideshow-dot ${i === activeSlide ? "active" : ""}`}
                        onClick={() => transitionToSlide(i)}
                        aria-label={`Go to slide ${i + 1}`}
                      />
                    ))}
                  </div>

                  <button
                    className="slideshow-arrow-btn"
                    onClick={nextSlide}
                    aria-label="Next bestseller"
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 5. FIRST-SCREEN VISIBLE MARQUEE ANIMATION */}
      <div className="marquee-container" aria-hidden="true">
        <div className="marquee-content">
          {[1, 2].map(k => (
            <React.Fragment key={k}>
              <span className="marquee-item">DIGITAL BIZWARE</span>
              <span className="marquee-dot">•</span>
              <span className="marquee-item">PRACTICAL KNOWLEDGE</span>
              <span className="marquee-dot">•</span>
              <span className="marquee-item">INNOVATION</span>
              <span className="marquee-dot">•</span>
              <span className="marquee-item">LEARN</span>
              <span className="marquee-dot">•</span>
              <span className="marquee-item">EXPLORE</span>
              <span className="marquee-dot">•</span>
              <span className="marquee-item">GROW</span>
              <span className="marquee-dot">•</span>
              <span className="marquee-item">DISCOVER</span>
              <span className="marquee-dot">•</span>
              <span className="marquee-item">DIGITAL BOOKS</span>
              <span className="marquee-dot">•</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* B. TRUST / BENEFITS STRIP */}
      <section className="trust-strip">
        <div className="wrap trust-grid">
          <div className="trust-item">
            <div className="trust-icon-box">⚡</div>
            <div className="trust-text">
              <h4>Instant Digital Access</h4>
              <p>Immediate PDF unlock directly in your account upon verified payment.</p>
            </div>
          </div>
          <div className="trust-item">
            <div className="trust-icon-box">🔒</div>
            <div className="trust-text">
              <h4>Secure Checkout</h4>
              <p>Industry-standard 256-bit encrypted transactions via Razorpay.</p>
            </div>
          </div>
          <div className="trust-item">
            <div className="trust-icon-box">📥</div>
            <div className="trust-text">
              <h4>Easy Downloads</h4>
              <p>Re-download your purchased eBooks anytime on desktop, tablet, or phone.</p>
            </div>
          </div>
          <div className="trust-item">
            <div className="trust-icon-box">📚</div>
            <div className="trust-text">
              <h4>Curated eBooks</h4>
              <p>Actionable, comprehensive blueprints authored by industry professionals.</p>
            </div>
          </div>
        </div>
      </section>

      {/* C. FEATURED EBOOKS SECTION */}
      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="eyebrow">READER FAVOURITES</div>
              <h2>Best-Selling Digital Editions</h2>
              <p>Practical guides earning a permanent place on professional desks.</p>
            </div>
            <Link className="textlink" href="/explore?tag=Bestseller">
              Browse all bestsellers ↗
            </Link>
          </div>
          {error ? (
            <ServiceMessage error={error} />
          ) : loading ? (
            <p className="loading-note">Loading reader favourites…</p>
          ) : (
            <div className="book-grid">
              {featured.map(b => (
                <ProductCard key={b._id} book={b} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* D. EXPLORE CATEGORIES SECTION */}
      <section className="section" style={{ background: "var(--bg-soft)", borderTop: "1px solid var(--line)" }}>
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="eyebrow">LEARNING TRACKS</div>
              <h2>Explore Specialized Disciplines</h2>
              <p>Structured roadmaps designed for immediate workplace application.</p>
            </div>
            <Link className="textlink" href="/categories">
              View all tracks ↗
            </Link>
          </div>
          <CategoryGrid />
        </div>
      </section>

      {/* E. PROMOTIONAL / EDITORIAL BANNER */}
      <section className="promo-section">
        <div className="wrap promo-grid">
          <div className="promo-copy">
            <div className="eyebrow">ACCELERATE YOUR EXECUTION</div>
            <h2>Your Next Big Idea Starts With One Book.</h2>
            <p>
              Transform abstract concepts into decisive execution. Every Digital
              Bizware guide is structured for immediate application in modern business,
              technology, and creative workflows.
            </p>
            <div className="promo-features">
              <div className="promo-feature-row">
                <span className="promo-feature-num">01</span>
                <span>Zero fluff — strictly actionable industry blueprints</span>
              </div>
              <div className="promo-feature-row">
                <span className="promo-feature-num">02</span>
                <span>One-time transparent pricing with lifetime library access</span>
              </div>
              <div className="promo-feature-row">
                <span className="promo-feature-num">03</span>
                <span>Standardized PDF editions compatible with every reader</span>
              </div>
            </div>
            <Link href="/explore" className="btn btn-yellow">
              Explore the Collection ↗
            </Link>
          </div>

          <div className="promo-visual">
            <div className="promo-book-box">
              <Cover book={featuredBook} />
            </div>
          </div>
        </div>
      </section>

      {/* F. WHY DIGITAL BIZWARE SECTION */}
      <section className="section why-section" id="why-us">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="eyebrow">THE DIGITAL BIZWARE STANDARD</div>
              <h2>Why Professionals Choose Digital Bizware</h2>
              <p>Built from the ground up for modern career growth and practical mastery.</p>
            </div>
          </div>
          <div className="why-grid">
            <div className="why-card">
              <div className="icon-box">⚡</div>
              <h3>Instant Digital Delivery</h3>
              <p>
                Get immediate access to your eBooks in PDF format right upon checkout. No waiting, no physical shipping delays.
              </p>
            </div>
            <div className="why-card">
              <div className="icon-box">🔒</div>
              <h3>Bank-Grade Payments</h3>
              <p>
                Powered by trusted, PCI-DSS compliant Razorpay gateway with support for UPI, credit/debit cards, and net banking.
              </p>
            </div>
            <div className="why-card">
              <div className="icon-box">📥</div>
              <h3>Permanent Cloud Library</h3>
              <p>
                Your purchases are tied to your verified account. Re-download your editions anytime from your personal dashboard.
              </p>
            </div>
            <div className="why-card">
              <div className="icon-box">💎</div>
              <h3>High-Value Blueprints</h3>
              <p>
                Curated and authored by practitioners with real market experience in marketing, programming, SEO, and design.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* G. RECENTLY ADDED EBOOKS */}
      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="eyebrow">FRESH RELEASES</div>
              <h2>Recently Added Publications</h2>
              <p>Stay ahead with the newest editions published to the collection.</p>
            </div>
            <Link className="textlink" href="/explore?tag=New">
              See all new releases ↗
            </Link>
          </div>
          {error ? (
            <ServiceMessage error={error} />
          ) : (
            <div className="book-grid">
              {(fresh.length ? fresh : books.slice(4, 8)).map(b => (
                <ProductCard key={b._id} book={b} />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function CategoryGrid() {
  const [cats, setCats] = useState<{ name: Category; count: number }[]>(
    subjects.map(x => ({ name: x[0], count: 5 }))
  );

  useEffect(() => {
    api<any[]>("/categories")
      .then(r => setCats(r.map(x => ({ name: x.name as Category, count: x.count || 0 }))))
      .catch(() => {});
  }, []);

  const icons: Record<string, string> = {
    "Digital Marketing": "📈",
    "Computer Courses": "💻",
    "English Speaking": "🎙️",
    "IT courses": "🛡️",
    "Graphic Design": "🎨",
  };

  return (
    <div className="categories">
      {cats.map(({ name: c, count }, i) => (
        <Link
          key={c}
          className={`cat ${i === 0 ? "cat-lead" : ""}`}
          href={`/category/${c.toLowerCase().replaceAll(" ", "-")}`}
        >
          <div className="cat-top">
            <span className="cat-icon-badge">{icons[c] || "📖"}</span>
            <span className="cat-num">TRACK 0{i + 1} · {count} GUIDES</span>
          </div>
          <div>
            <h3>{c}</h3>
            <p>
              {subjects.find(x => x[0] === c)?.[1] ||
                "Comprehensive practical field manuals to expand your professional toolkit."}
            </p>
          </div>
          <div className="cat-foot">
            <span>Explore Track</span>
            <span>↗</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ==========================================================================
   CATEGORIES PAGE
   ========================================================================== */
export function CategoriesPage() {
  return (
    <main className="page">
      <div className="wrap">
        <div className="eyebrow">DIGITAL BIZWARE DISCIPLINES</div>
        <h1 className="page-title">Explore Learning Tracks</h1>
        <p className="about-text">
          Browse focused collections crafted for professionals, students, and
          entrepreneurs seeking practical execution.
        </p>
        <CategoryGrid />
      </div>
    </main>
  );
}

function mapCategorySlug(slug: string): string {
  if (!slug) return "";
  const decoded = decodeURIComponent(slug).toLowerCase().trim();
  const matched = subjects.find(([c]) => c.toLowerCase().replaceAll(" ", "-") === decoded);
  if (matched) return matched[0];
  return decoded.split("-").map(x => (x ? x[0].toUpperCase() + x.slice(1) : x)).join(" ");
}

/* ==========================================================================
   CATALOGUE / EXPLORE PAGE
   ========================================================================== */
export function CataloguePage({ categorySlug = "" }: { categorySlug?: string }) {
  const initialCat = useMemo(() => mapCategorySlug(categorySlug), [categorySlug]);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState(initialCat);
  const [sort, setSort] = useState("popular");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const [availableCategories, setAvailableCategories] = useState<string[]>(subjects.map(s => s[0]));

  useEffect(() => {
    api<any[]>("/categories")
      .then(cats => {
        if (Array.isArray(cats) && cats.length > 0) {
          setAvailableCategories(cats.map(c => c.name));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("tag")) setTag(sp.get("tag") || "");
      if (sp.get("q")) setQuery(sp.get("q") || "");
      if (sp.get("category") && !categorySlug) {
        setCat(mapCategorySlug(sp.get("category") || ""));
      }
    }
  }, [categorySlug]);

  useEffect(() => {
    if (initialCat) setCat(initialCat);
  }, [initialCat]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    setPage(1);
  };
  const handleCatChange = (val: string) => {
    setCat(val);
    setPage(1);
  };
  const handleSortChange = (val: string) => {
    setSort(val);
    setPage(1);
  };
  const handleTagChange = (val: string) => {
    setTag(val);
    setPage(1);
  };

  const queryString = `page=${page}&limit=12&q=${encodeURIComponent(query)}&category=${encodeURIComponent(cat)}&sort=${sort}${tag ? `&tag=${encodeURIComponent(tag)}` : ""}`;
  const { books, total, totalPages, loading, error } = useCatalogue(queryString);

  return (
    <main className="page catalogue-page">
      <div className="wrap">
        <div className="eyebrow">{cat ? `TRACK: ${cat.toUpperCase()}` : "COMPLETE EBOOK MARKETPLACE"}</div>
        <h1 className="page-title">{cat || "Explore the Complete Collection"}</h1>
        <p className="about-text">
          Browse clear, practical digital books designed to give you competitive skills and immediate mastery.
        </p>

        {/* Filter & Search Bar */}
        <div className="catalogue-tools-box">
          <div className="catalogue-tools-row">
            <input
              aria-label="Search eBooks"
              placeholder="🔍 Search titles, authors or keywords…"
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
            />
            <select
              aria-label="Filter category"
              value={cat}
              onChange={e => handleCatChange(e.target.value)}
            >
              <option value="">All Categories</option>
              {availableCategories.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort eBooks"
              value={sort}
              onChange={e => handleSortChange(e.target.value)}
            >
              <option value="popular">Most Popular</option>
              <option value="newest">Newest Releases</option>
              <option value="low">Price: Low to High</option>
              <option value="high">Price: High to Low</option>
            </select>
            <select
              aria-label="Filter tag"
              value={tag}
              onChange={e => handleTagChange(e.target.value)}
            >
              <option value="">All Editions</option>
              <option value="Bestseller">Bestsellers Only</option>
              <option value="New">New Arrivals Only</option>
            </select>
          </div>

          <div className="catalogue-tag-pills">
            <button
              className={`tag-pill ${!cat ? "active" : ""}`}
              onClick={() => handleCatChange("")}
            >
              All Disciplines
            </button>
            {availableCategories.map(c => (
              <button
                key={c}
                className={`tag-pill ${cat === c ? "active" : ""}`}
                onClick={() => handleCatChange(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="catalogue-count">
          Showing <strong>{total}</strong> verified eBook{total === 1 ? "" : "s"}
        </div>

        {error ? (
          <ServiceMessage error={error} />
        ) : loading ? (
          <p className="loading-note">Loading Digital Bizware collection…</p>
        ) : books.length ? (
          <>
            <div className="book-grid">
              {books.map(b => (
                <ProductCard key={b._id} book={b} />
              ))}
            </div>

            {totalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  justifyContent: "center",
                  alignItems: "center",
                  marginTop: "48px",
                }}
              >
                <button
                  className="btn outline small"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  ← Previous
                </button>
                <span style={{ fontSize: "13px", fontWeight: "700" }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  className="btn outline small"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <h2>No eBooks match your filter criteria.</h2>
            <p>Try resetting the search terms or explore a different category.</p>
            <button
              className="btn btn-yellow small"
              onClick={() => {
                setQuery("");
                setCat("");
                setTag("");
                setSort("popular");
                setPage(1);
              }}
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

/* ==========================================================================
   PRODUCT DETAILS PAGE
   ========================================================================== */
export function ProductPage({ slug }: { slug: string }) {
  const [book, setBook] = useState<BookRecord | null>(null);
  const [error, setError] = useState("");
  const { add } = useCart();
  const router = useRouter();

  useEffect(() => {
    api<BookRecord>(`/books/${slug}`)
      .then(setBook)
      .catch(e => setError(e.message));
  }, [slug]);

  if (!book) {
    return (
      <main className="page">
        <div className="wrap">
          {error ? <ServiceMessage error={error} /> : <p className="loading-note">Loading eBook edition…</p>}
        </div>
      </main>
    );
  }

  const buy = () => {
    add(book);
    router.push("/checkout");
  };

  const discountPercent =
    book.originalPrice && book.sellingPrice < book.originalPrice
      ? Math.round((1 - book.sellingPrice / book.originalPrice) * 100)
      : 0;

  return (
    <main className="page product-page">
      <div className="wrap">
        <nav className="product-breadcrumbs">
          <Link href="/">Home</Link>
          <span>/</span>
          <Link href="/categories">Categories</Link>
          <span>/</span>
          <Link href={`/category/${book.category.toLowerCase().replaceAll(" ", "-")}`}>
            {book.category}
          </Link>
          <span>/</span>
          <span>{book.title}</span>
        </nav>

        <div className="detail-grid">
          <div className="detail-cover-box">
            <Cover book={book} />
          </div>

          <div className="detail-copy">
            <div className="eyebrow">
              {book.category} · {book.tag || "DIGITAL BIZWARE OFFICIAL"}
            </div>
            <h1>{book.title}</h1>
            <p className="sub">
              {book.subtitle ||
                "A comprehensive, practical guide engineered for professionals and students seeking measurable skill mastery."}
            </p>

            <div className="detail-stats">
              <span className="rating">
                <span className="rating-star">★</span> {Number(book.rating || 4.8).toFixed(1)}
              </span>
              <span>{book.reviewCount || 124} reader reviews</span>
              <span>Authored by <strong>{book.author}</strong></span>
            </div>

            <div className="detail-price-box">
              <span className="detail-price">{money(book.sellingPrice)}</span>
              {book.originalPrice > book.sellingPrice && (
                <span className="oldprice">{money(book.originalPrice)}</span>
              )}
              {discountPercent > 0 && (
                <span className="discount-pill">SAVE {discountPercent}%</span>
              )}
            </div>

            <div className="detail-buy">
              <button
                className="btn btn-yellow"
                disabled={!book.availableForPurchase}
                onClick={() => add(book)}
              >
                {book.availableForPurchase ? "Add to Bag 🛍️" : "Coming Soon"}
              </button>
              <button
                className="btn outline"
                disabled={!book.availableForPurchase}
                onClick={buy}
              >
                Instant Buy Now ⚡
              </button>
            </div>

            <div className="digital-guarantee-box">
              <span className="icon">✓</span>
              <span>
                Instant Digital Access · PDF format · {book.pages || 140} pages · Permanent lifetime cloud storage
              </span>
            </div>

            <div className="product-tabs-content">
              <h3>About this eBook</h3>
              <p>{book.description}</p>

              {book.preview && book.preview.length > 0 && (
                <>
                  <h3>Core Learning Highlights</h3>
                  <ul className="preview-list">
                    {book.preview.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </>
              )}

              {book.tableOfContents && book.tableOfContents.length > 0 && (
                <>
                  <h3>Inside the Curriculum</h3>
                  <div className="toc-list">
                    {book.tableOfContents.map((x, i) => (
                      <div className="toc-item" key={`${i}-${x}`}>
                        <span className="toc-num">Chapter {String(i + 1).padStart(2, "0")}</span>
                        <span>{x}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <section className="section" style={{ borderTop: "1px solid var(--line)", paddingBottom: 0 }}>
          <div className="section-head">
            <h2>More Recommended Guides in {book.category}</h2>
            <Link href={`/category/${book.category.toLowerCase().replaceAll(" ", "-")}`} className="textlink">
              Explore track ↗
            </Link>
          </div>
          <RelatedBooks book={book} />
        </section>
      </div>
    </main>
  );
}

function RelatedBooks({ book }: { book: BookRecord }) {
  const { books } = useCatalogue(`category=${encodeURIComponent(book.category)}&limit=5`);
  return (
    <div className="book-grid">
      {books
        .filter(x => x._id !== book._id)
        .slice(0, 4)
        .map(x => (
          <ProductCard key={x._id} book={x} />
        ))}
    </div>
  );
}

/* ==========================================================================
   CART PAGE
   ========================================================================== */
export function CartPage() {
  const { items, remove, clear } = useCart();

  return (
    <main className="page">
      <div className="wrap">
        <div className="eyebrow">YOUR SELECTION</div>
        <h1 className="page-title">Review Your Shopping Bag</h1>

        {!items.length ? (
          <div className="empty-state">
            <div className="empty-state-icon">🛍️</div>
            <h2>Your shopping bag is currently empty.</h2>
            <p>Explore the Digital Bizware catalogue and add practical guides to your library.</p>
            <Link className="btn btn-yellow" href="/explore">
              Explore Collection
            </Link>
          </div>
        ) : (
          <div className="cart-layout">
            <div className="cart-items">
              {items.map(b => (
                <div className="cart-row" key={b._id}>
                  <Link href={`/book/${b.slug}`}>
                    <Cover book={b} />
                  </Link>
                  <div>
                    <div className="book-cat">{b.category}</div>
                    <h3>{b.title}</h3>
                    <p>By {b.author}</p>
                    <button className="remove-btn" onClick={() => remove(b._id)}>
                      Remove item
                    </button>
                  </div>
                  <strong>{money(b.sellingPrice)}</strong>
                </div>
              ))}
              <div style={{ paddingTop: "12px" }}>
                <button
                  onClick={clear}
                  style={{ color: "var(--muted)", fontSize: "13px", cursor: "pointer" }}
                >
                  Clear all items from bag
                </button>
              </div>
            </div>

            <div className="summary">
              <h3>Order Summary</h3>
              <p style={{ fontSize: "13.5px", color: "var(--muted)" }}>
                {items.length} Digital Edition{items.length === 1 ? "" : "s"}
              </p>
              <div className="checkout-trust-box">
                <span>🔒</span>
                <span>One-time purchase · Instant PDF download</span>
              </div>
              <div className="summary-total">
                <span>Total Due</span>
                <strong>{money(items.reduce((s, b) => s + b.sellingPrice, 0))}</strong>
              </div>
              <Link href="/checkout" className="btn btn-yellow" style={{ width: "100%" }}>
                Proceed to Secure Checkout ↗
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

declare global {
  interface Window {
    Razorpay?: any;
  }
}

/* ==========================================================================
   CHECKOUT PAGE
   ========================================================================== */
export function CheckoutPage() {
  const { items, clear } = useCart();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [paymentState, setPaymentState] = useState("idle");
  const [pendingOrder, setPendingOrder] = useState("");
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    api("/auth/me")
      .then(x => setUser((x as any).user))
      .catch(() => {});

    const saved = sessionStorage.getItem("classes-pending-order");
    if (saved) {
      setPendingOrder(saved);
      setPaymentState("processing");
    }
  }, []);

  async function refreshPayment() {
    if (!pendingOrder) return;
    setRefreshing(true);
    setError("");
    try {
      const status = await api<any>(`/payments/status/${encodeURIComponent(pendingOrder)}`);
      if (status.status === "paid") {
        setPaymentState("paid");
        sessionStorage.removeItem("classes-pending-order");
        clear();
        router.push("/student?paid=1");
      } else if (status.status === "failed" || status.status === "refunded") {
        setPaymentState(status.status);
        sessionStorage.removeItem("classes-pending-order");
        setPendingOrder("");
        setError(
          status.status === "refunded"
            ? "This transaction has been refunded."
            : "Payment verification failed. You may retry checkout."
        );
      } else {
        setPaymentState("processing");
        setError("Payment is still processing with the bank. Please refresh in a moment.");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }

  async function pay() {
    setError("");
    if (!user) {
      router.push("/login?next=/checkout");
      return;
    }
    if (!items.length) {
      router.push("/explore");
      return;
    }
    setBusy(true);

    try {
      const k = await api<any>("/payments/key");
      const keyId = k.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

      const order = await api<any>("/payments/create-order", {
        method: "POST",
        body: JSON.stringify({ bookIds: items.map(x => x._id) }),
      });

      setPendingOrder(order.orderId);
      sessionStorage.setItem("classes-pending-order", order.orderId);

      // Secure payment modal via Razorpay
      if (!window.Razorpay) {
        await new Promise<void>((ok, no) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => ok();
          script.onerror = () => no(new Error("Unable to load secure checkout gateway."));
          document.body.appendChild(script);
        });
      }

      setPaymentState("processing");
      const rz = new window.Razorpay({
        key: keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Digital Bizware",
        description: "Official eBook Collection Order",
        order_id: order.orderId,
        prefill: { name: user.name, email: user.email },
        theme: { color: "#FFD600" },
        handler: async (response: any) => {
          try {
            await api("/payments/verify", {
              method: "POST",
              body: JSON.stringify(response),
            });
            setPaymentState("paid");
            sessionStorage.removeItem("classes-pending-order");
            clear();
            router.push("/student?paid=1");
          } catch (e: any) {
            setError(e.message);
            setPaymentState("processing");
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });

      rz.on("payment.failed", (r: any) => {
        setError(r.error?.description || "Payment was not completed. You may try again.");
        setPaymentState("processing");
        setBusy(false);
      });

      rz.open();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="wrap" style={{ maxWidth: "800px" }}>
        <div className="eyebrow">CHECKOUT GATEWAY</div>
        <h1 className="page-title">Complete Your Purchase</h1>

        {error && (
          <p className={paymentState === "processing" ? "form-success" : "form-error"}>
            {error}
          </p>
        )}

        {paymentState === "processing" && pendingOrder && (
          <div
            style={{
              background: "#FFFBE6",
              border: "1.5px solid #FFD600",
              padding: "20px",
              borderRadius: "var(--radius-sm)",
              marginBottom: "24px",
            }}
          >
            <strong>Transaction Initiated</strong>
            <p style={{ margin: "6px 0 14px", fontSize: "13.5px" }}>
              Your eBooks will unlock immediately upon backend confirmation.
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                className="btn outline small"
                disabled={refreshing}
                onClick={refreshPayment}
              >
                {refreshing ? "Verifying…" : "Refresh Payment Status"}
              </button>
              <button className="btn btn-yellow small" disabled={busy} onClick={pay}>
                {busy ? "Opening…" : "Re-open Payment Gateway"}
              </button>
            </div>
          </div>
        )}

        {!items.length ? (
          <div className="empty-state">
            <p>Your shopping bag is empty.</p>
            <Link href="/explore" className="btn btn-yellow">
              Explore Collection
            </Link>
          </div>
        ) : (
          <div className="summary">
            <h2>Order Review</h2>
            {items.map(b => (
              <p className="checkout-line" key={b._id}>
                <span>{b.title}</span>
                <strong>{money(b.sellingPrice)}</strong>
              </p>
            ))}

            <div className="summary-total">
              <span>Total Payable</span>
              <strong>{money(items.reduce((s, b) => s + b.sellingPrice, 0))}</strong>
            </div>

            {user ? (
              <p style={{ fontSize: "13px", color: "var(--muted)", margin: "4px 0" }}>
                Purchasing under verified account: <strong>{user.name}</strong> ({user.email})
              </p>
            ) : (
              <p style={{ fontSize: "13.5px", color: "var(--error)", margin: "4px 0" }}>
                Please{" "}
                <Link href="/login?next=/checkout" style={{ textDecoration: "underline", fontWeight: "700" }}>
                  sign in
                </Link>{" "}
                or{" "}
                <Link href="/register?next=/checkout" style={{ textDecoration: "underline", fontWeight: "700" }}>
                  create an account
                </Link>{" "}
                to unlock your digital downloads.
              </p>
            )}

            <button
              className="btn btn-yellow"
              style={{ width: "100%", padding: "16px", fontSize: "15px" }}
              onClick={pay}
              disabled={busy || paymentState === "processing"}
            >
              {busy
                ? "Launching Secure Checkout…"
                : paymentState === "failed"
                ? "Retry Payment"
                : "Pay Securely with Razorpay"}
            </button>

            <div className="checkout-trust-box" style={{ justifyContent: "center" }}>
              <span>🔒 256-Bit SSL Encrypted · Instant PDF Delivery via Cloud Library</span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/* ==========================================================================
   AUTHENTICATION PAGES (LOGIN & REGISTER)
   ========================================================================== */
export function AuthPage({
  register = false,
  successPath = "/student",
  showRegisterLink = true,
}: {
  register?: boolean;
  successPath?: string;
  showRegisterLink?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const out = await api<any>(register ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (out.token) {
        setAuthToken(out.token);
      }
      setMessage(out.message || (register ? "Account created! Please check your email to verify your address." : ""));
      if (!register) {
        const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
        router.push(next || successPath);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link className="brand" href="/" style={{ marginBottom: "20px" }}>
          <img className="brand-logo-img" src="/assets/logo.png" alt="Digital Bizware Logo" />
          <div className="brand-text-wrap">
            <span className="brand-name">
              DIGITAL <span>BIZWARE</span>
            </span>
          </div>
        </Link>

        <div className="eyebrow">{register ? "CREATE ACCOUNT" : "WELCOME BACK"}</div>
        <h1>{register ? "Join Digital Bizware" : "Sign In to Your Library"}</h1>
        <p>
          {register
            ? "Create an account to store and manage your purchased eBook editions."
            : "Access your purchased digital guides and reading materials."}
        </p>

        <form onSubmit={submit} className="form-stack">
          {register && (
            <>
              <div className="form-field">
                <label>Full Name</label>
                <input required name="name" autoComplete="name" placeholder="John Doe" />
              </div>
              <div className="form-field">
                <label>Mobile Number</label>
                <input required name="phone" autoComplete="tel" placeholder="9876543210" />
              </div>
            </>
          )}

          <div className="form-field">
            <label>Email Address</label>
            <input required type="email" name="email" autoComplete="email" placeholder="name@example.com" />
          </div>

          <div className="form-field">
            <label>Password</label>
            <div className="password-wrap">
              <input
                required
                type={showPassword ? "text" : "password"}
                name="password"
                minLength={register ? 10 : 1}
                autoComplete={register ? "new-password" : "current-password"}
                placeholder="••••••••••••"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label="Toggle password visibility"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button className="btn btn-yellow" disabled={busy} style={{ marginTop: "8px" }}>
            {busy ? "Please wait…" : register ? "Create Account ↗" : "Sign In ↗"}
          </button>

          {error && <p className="form-error">{error}</p>}
          {message && <p className="form-success">{message}</p>}
        </form>

        {register ? (
          <p className="auth-switch">
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        ) : (
          <>
            <ForgotPassword />
            {showRegisterLink && (
              <p className="auth-switch">
                New to Digital Bizware? <Link href="/register">Create an account</Link>
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function ForgotPassword() {
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  return (
    <div style={{ marginTop: "16px", textAlign: "center" }}>
      <button
        type="button"
        onClick={() => setShow(!show)}
        style={{ fontSize: "13px", color: "var(--muted)", textDecoration: "underline", cursor: "pointer" }}
      >
        Forgot your password?
      </button>

      {show && (
        <form
          onSubmit={async e => {
            e.preventDefault();
            setError("");
            setMessage("");
            try {
              const r = await api<any>("/auth/forgot-password", {
                method: "POST",
                body: JSON.stringify({ email }),
              });
              setMessage(r.message || "Password reset instructions dispatched to your email address.");
            } catch (x: any) {
              setError(x.message);
            }
          }}
          style={{ marginTop: "16px", textAlign: "left" }}
        >
          <div className="form-field">
            <label>Registered Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>
          <button className="btn small btn-dark" style={{ marginTop: "8px", width: "100%" }}>
            Send Reset Link
          </button>
          {message && <p className="form-success" style={{ marginTop: "8px" }}>{message}</p>}
          {error && <p className="form-error" style={{ marginTop: "8px" }}>{error}</p>}
        </form>
      )}
    </div>
  );
}

/* ==========================================================================
   EMAIL VERIFICATION TOKEN PAGE
   ========================================================================== */
export function TokenPage({ token }: { token: string }) {
  const [status, setStatus] = useState("Verifying your email address…");
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("Verification link is missing or expired.");
      return;
    }
    api<any>("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) })
      .then(res => {
        if (res?.token) setAuthToken(res.token);
        setStatus("Your email has been verified successfully. Your account is ready.");
        setVerified(true);
      })
      .catch(e => setStatus(e.message));
  }, [token]);

  return (
    <main className="page">
      <div className="wrap empty-state">
        <div className="eyebrow">ACCOUNT VERIFICATION</div>
        <h1>{status}</h1>
        {verified && (
          <Link className="btn btn-yellow" href="/student" style={{ marginTop: "20px" }}>
            Go to Your Library ↗
          </Link>
        )}
      </div>
    </main>
  );
}

/* ==========================================================================
   RESET PASSWORD PAGE
   ========================================================================== */
export function ResetPage({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="eyebrow">ACCOUNT SECURITY</div>
        <h1>Choose a New Password</h1>
        {done ? (
          <div>
            <p className="form-success">Password updated successfully. You may now sign in.</p>
            <Link href="/login" className="btn btn-yellow small" style={{ marginTop: "14px" }}>
              Sign In ↗
            </Link>
          </div>
        ) : (
          <form
            className="form-stack"
            onSubmit={async e => {
              e.preventDefault();
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                await api("/auth/reset-password", {
                  method: "POST",
                  body: JSON.stringify({ token, password: f.get("password") }),
                });
                setDone(true);
              } catch (x: any) {
                setError(x.message);
              }
            }}
          >
            <div className="form-field">
              <label>New Password (min 10 characters)</label>
              <input
                type="password"
                name="password"
                minLength={10}
                required
                autoComplete="new-password"
                placeholder="Minimum 10 characters"
              />
            </div>
            <button className="btn btn-yellow">Update Password</button>
            {error && <p className="form-error">{error}</p>}
          </form>
        )}
        <div style={{ marginTop: "16px", textAlign: "center" }}>
          <Link href="/login" style={{ fontSize: "13px", color: "var(--muted)" }}>
            ← Back to Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}

/* ==========================================================================
   STUDENT / USER DASHBOARD
   ========================================================================== */
export function StudentPage() {
  const [data, setData] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    Promise.all([
      api<any>("/student/library"),
      api<any>("/auth/me"),
      api<any>("/student/dashboard"),
    ])
      .then(([library, account, dashboard]) => {
        setData(library);
        setProfile(account.user);
        setSummary(dashboard);
      })
      .catch(e => {
        setError(e.message);
        if (e.message.includes("Sign in required") || e.message.includes("Session expired")) {
          router.push("/login?next=/student");
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function download(book: BookRecord) {
    try {
      setDownloadingId(book._id);
      setError("");
      const res = await api<{ url: string }>(`/books/${book._id}/download`);
      if (res.url) {
        window.location.assign(res.url);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDownloadingId(null);
    }
  }

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      clearAuthToken();
      router.push("/");
    }
  }

  return (
    <main className="page student-page">
      <div className="wrap">
        <div className="dashboard-heading">
          <div>
            <div className="eyebrow">DIGITAL BIZWARE LIBRARY</div>
            <h1>Welcome Back, {profile?.name || "Student"}!</h1>
            <p style={{ color: "var(--muted)", marginTop: "4px" }}>
              All your purchased eBook editions remain here with unlimited lifetime re-downloads.
            </p>
          </div>
          <button className="btn outline small" onClick={logout}>
            Sign Out
          </button>
        </div>

        {error && (
          <p className="form-error" style={{ marginBottom: "24px" }}>
            {error}
            {error.includes("Sign in") && (
              <>
                {" "}· <Link href="/login" style={{ textDecoration: "underline" }}>Sign in</Link>
              </>
            )}
          </p>
        )}

        {loading ? (
          <p className="loading-note">Accessing your secure eBook locker…</p>
        ) : data?.items ? (
          <>
            <div className="dashboard-stats">
              <div className="dashboard-stat-card">
                <span>MY EBOOKS</span>
                <strong>
                  {
                    data.items.filter(
                      (item: any) =>
                        item.purchase.entitlementStatus === "active" &&
                        item.purchase.paymentStatus === "paid"
                    ).length
                  }
                </strong>
              </div>
              <div className="dashboard-stat-card">
                <span>CATALOGUE AVAILABLE</span>
                <strong>{summary?.availableBooks || 0}</strong>
              </div>
              <div className="dashboard-stat-card">
                <span>ACCOUNT SECURITY</span>
                <strong>{profile?.emailVerified ? "Verified ✓" : "Verification Pending"}</strong>
              </div>
            </div>

            <div className="section-head" style={{ marginBottom: "24px" }}>
              <h2>Your eBook Collection</h2>
            </div>

            {data.items.length ? (
              <div className="book-grid library-grid">
                {data.items.map((item: any) => (
                  <article className="store-card library-card" key={item.purchase._id}>
                    <Link href={`/book/${item.book.slug}`}>
                      <Cover book={item.book} />
                    </Link>
                    <div className="book-info">
                      <div className="book-cat">
                        Purchased{" "}
                        {new Date(item.purchase.purchasedAt).toLocaleDateString("en-IN")}
                      </div>
                      <h3>{item.book.title}</h3>
                      <p className="book-desc">
                        By {item.book.author} · {money(item.purchase.amountPaid)} paid
                      </p>
                      {item.purchase.entitlementStatus === "active" &&
                      item.purchase.paymentStatus === "paid" ? (
                        <button
                          className="btn btn-yellow small"
                          disabled={downloadingId === item.book._id}
                          onClick={() => download(item.book)}
                          style={{ marginTop: "auto" }}
                        >
                          {downloadingId === item.book._id
                            ? "Preparing PDF…"
                            : "Download eBook (PDF) 📥"}
                        </button>
                      ) : (
                        <span
                          style={{
                            fontSize: "12px",
                            fontWeight: "700",
                            color: "var(--error)",
                            marginTop: "auto",
                          }}
                        >
                          Access {item.purchase.entitlementStatus}
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">📖</div>
                <h2>Your digital library is waiting.</h2>
                <p>When you purchase an eBook, it will appear here permanently.</p>
                <Link className="btn btn-yellow" href="/explore">
                  Explore the Catalogue
                </Link>
              </div>
            )}

            <section className="student-lower">
              <div className="account-panel">
                <div className="eyebrow">STUDENT ACCOUNT</div>
                <h2 style={{ fontFamily: "var(--heading)", fontSize: "20px", margin: "10px 0" }}>
                  {profile?.name}
                </h2>
                <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: "1.6" }}>
                  {profile?.email}
                  <br />
                  Phone: {profile?.phone || "Not configured"}
                  <br />
                  Status:{" "}
                  <strong style={{ color: profile?.emailVerified ? "var(--success)" : "var(--error)" }}>
                    {profile?.emailVerified ? "Email Verified" : "Email Unverified"}
                  </strong>
                </p>
              </div>

              <div className="student-list">
                <div className="eyebrow">ORDER LOG</div>
                <h2>Recent Purchases</h2>
                {summary?.recentOrders?.length ? (
                  summary.recentOrders.map((o: any) => (
                    <div className="student-list-row" key={o._id}>
                      <span>{o.items.map((x: any) => x.title).join(", ")}</span>
                      <strong>{money(o.totalAmount)}</strong>
                      <small style={{ color: "var(--muted)" }}>
                        {new Date(o.createdAt).toLocaleDateString("en-IN")}
                      </small>
                    </div>
                  ))
                ) : (
                  <p style={{ color: "var(--muted)", fontSize: "13.5px" }}>No orders placed yet.</p>
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

export { AdminPage } from "./admin";
