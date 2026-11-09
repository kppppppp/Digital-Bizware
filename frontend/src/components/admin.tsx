"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import type { BookRecord } from "@classes/shared";
import { api, money, coverUrl, API, getAuthToken, clearAuthToken } from "@/lib/api";
import { Cover } from "./store";

export function AdminPage() {
  const [user, setUser] = useState<any>(null);
  const [tab, setTab] = useState<"overview" | "books" | "add-book" | "categories" | "students" | "orders" | "services" | "settings">("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [servicesStatus, setServicesStatus] = useState<any>(null);

  // Settings & Password Change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  // Books state
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [booksTotal, setBooksTotal] = useState(0);
  const [booksPage, setBooksPage] = useState(1);
  const [booksTotalPages, setBooksTotalPages] = useState(1);
  const [bookQuery, setBookQuery] = useState("");
  const [bookCategory, setBookCategory] = useState("");
  const [bookStatus, setBookStatus] = useState("");
  const [bookSort, setBookSort] = useState("newest");

  // Dynamic Categories state
  const [categoriesList, setCategoriesList] = useState<any[]>([]);
  const [catEditing, setCatEditing] = useState<any>(null);
  const [catName, setCatName] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [catOrder, setCatOrder] = useState(0);
  const [catBusy, setCatBusy] = useState(false);

  // Students state
  const [students, setStudents] = useState<any[]>([]);
  const [studentsTotal, setStudentsTotal] = useState(0);
  const [studentsPage, setStudentsPage] = useState(1);
  const [studentsTotalPages, setStudentsTotalPages] = useState(1);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentStatus, setStudentStatus] = useState("");

  // Orders state
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersTotalPages, setOrdersTotalPages] = useState(1);
  const [orderQuery, setOrderQuery] = useState("");
  const [orderStatus, setOrderStatus] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<any>(null);
  const [studentPurchases, setStudentPurchases] = useState<any>(null);
  const router = useRouter();

  // Authentication check
  useEffect(() => {
    setLoading(true);
    api<any>("/auth/me")
      .then(r => {
        setUser(r.user);
        if (r.user.role !== "admin") {
          setError("Administrator access required.");
        }
      })
      .catch(() => {
        setError("Sign in with an administrator account to continue.");
      })
      .finally(() => setLoading(false));
  }, []);

  // Fetch dynamic categories
  useEffect(() => {
    if (!user || user.role !== "admin") return;
    api<any[]>("/categories")
      .then(list => setCategoriesList(list || []))
      .catch(() => {});
  }, [user, refresh]);

  // Fetch overview stats
  useEffect(() => {
    if (!user || user.role !== "admin") return;
    if (tab === "overview") {
      api<any>("/admin/dashboard")
        .then(d => setStats(d))
        .catch(e => setError(e.message));
    }
  }, [user, tab, refresh]);

  // Fetch services status
  useEffect(() => {
    if (!user || user.role !== "admin") return;
    if (tab === "services") {
      api<any>("/admin/services-status")
        .then(d => setServicesStatus(d))
        .catch(e => setError(e.message));
    }
  }, [user, tab, refresh]);

  // Fetch books with filters and pagination
  useEffect(() => {
    if (!user || user.role !== "admin") return;
    if (tab === "books") {
      const sp = new URLSearchParams({
        page: String(booksPage),
        limit: "20",
        q: bookQuery,
        category: bookCategory,
        status: bookStatus,
        sort: bookSort,
      });
      api<any>(`/admin/books?${sp.toString()}`)
        .then(res => {
          setBooks(res.items || []);
          setBooksTotal(res.total || 0);
          setBooksTotalPages(res.totalPages || 1);
        })
        .catch(e => setError(e.message));
    }
  }, [user, tab, booksPage, bookQuery, bookCategory, bookStatus, bookSort, refresh]);

  // Fetch students with filters and pagination
  useEffect(() => {
    if (!user || user.role !== "admin") return;
    if (tab === "students") {
      const sp = new URLSearchParams({
        page: String(studentsPage),
        limit: "20",
        q: studentQuery,
        status: studentStatus,
      });
      api<any>(`/admin/students?${sp.toString()}`)
        .then(res => {
          setStudents(res.items || []);
          setStudentsTotal(res.total || 0);
          setStudentsTotalPages(res.totalPages || 1);
        })
        .catch(e => setError(e.message));
    }
  }, [user, tab, studentsPage, studentQuery, studentStatus, refresh]);

  // Fetch orders with filters and pagination
  useEffect(() => {
    if (!user || user.role !== "admin") return;
    if (tab === "orders") {
      const sp = new URLSearchParams({
        page: String(ordersPage),
        limit: "20",
        q: orderQuery,
        status: orderStatus,
      });
      api<any>(`/admin/orders?${sp.toString()}`)
        .then(res => {
          setOrders(res.items || []);
          setOrdersTotal(res.total || 0);
          setOrdersTotalPages(res.totalPages || 1);
        })
        .catch(e => setError(e.message));
    }
  }, [user, tab, ordersPage, orderQuery, orderStatus, refresh]);

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      clearAuthToken();
      router.push("/login");
    }
  }

  const showNotification = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");
    if (!currentPassword) {
      setPwError("Current password is required");
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setPwError("New password must be at least 8 characters long");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("New password and confirm password do not match");
      return;
    }
    try {
      setPwBusy(true);
      const res = await api<any>("/admin/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPwSuccess(res.message || "Password updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showNotification("Administrator password changed successfully!");
    } catch (err: any) {
      setPwError(err.message || "Failed to update password");
    } finally {
      setPwBusy(false);
    }
  }

  async function handleClearAllOrders() {
    if (!confirm("Are you sure you want to remove all dummy orders? This action cannot be undone.")) return;
    try {
      const res = await api<any>("/admin/orders/clear-all", { method: "POST" });
      showNotification(res.message || "All dummy orders cleared successfully!");
      setRefresh(x => x + 1);
    } catch (err: any) {
      setError(err.message || "Failed to clear orders");
    }
  }

  async function handleDeleteOrder(id: string) {
    if (!confirm("Permanently delete this order record?")) return;
    try {
      await api<any>(`/admin/orders/${id}`, { method: "DELETE" });
      showNotification("Order record removed");
      setRefresh(x => x + 1);
    } catch (err: any) {
      setError(err.message || "Failed to delete order");
    }
  }

  if (loading) {
    return (
      <main className="page admin-page">
        <div className="wrap">
          <p className="loading-note">Verifying administrator credentials…</p>
        </div>
      </main>
    );
  }

  if (error && (!user || user.role !== "admin")) {
    return (
      <main className="page admin-page">
        <div className="wrap">
          <div className="service-message" style={{ maxWidth: "500px", margin: "60px auto" }}>
            <h2>Access Restricted</h2>
            <p>{error}</p>
            <Link className="btn small" href="/login">
              Sign in as Admin
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="admin-shell">
      {/* Mobile Drawer Backdrop */}
      {mobileNavOpen && (
        <div
          className="admin-sidebar-backdrop"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Modern Sticky Admin Sidebar */}
      <aside className={`admin-sidebar ${mobileNavOpen ? "open" : ""}`}>
        <div>
          <div className="admin-brand-header">
            <img src="/assets/logo.png" alt="Digital Bizware Logo" />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span className="title">DIGITAL BIZWARE</span>
              <span className="portal-badge">Admin Portal</span>
            </div>
          </div>

          <nav className="admin-sidebar-nav">
            <button
              className={`admin-nav-link ${tab === "overview" ? "active" : ""}`}
              onClick={() => {
                setTab("overview");
                setMobileNavOpen(false);
              }}
            >
              <div className="nav-left">
                <span className="nav-icon">📊</span>
                <span>Dashboard</span>
              </div>
            </button>

            <button
              className={`admin-nav-link ${tab === "books" ? "active" : ""}`}
              onClick={() => {
                setTab("books");
                setMobileNavOpen(false);
              }}
            >
              <div className="nav-left">
                <span className="nav-icon">📚</span>
                <span>eBooks Catalogue</span>
              </div>
              {booksTotal > 0 && <span className="nav-badge">{booksTotal}</span>}
            </button>

            <button
              className={`admin-nav-link ${tab === "add-book" ? "active" : ""}`}
              onClick={() => {
                setTab("add-book");
                setMobileNavOpen(false);
              }}
            >
              <div className="nav-left">
                <span className="nav-icon">➕</span>
                <span>Add New eBook</span>
              </div>
            </button>

            <button
              className={`admin-nav-link ${tab === "categories" ? "active" : ""}`}
              onClick={() => {
                setTab("categories");
                setMobileNavOpen(false);
              }}
            >
              <div className="nav-left">
                <span className="nav-icon">🏷️</span>
                <span>Categories</span>
              </div>
              {categoriesList.length > 0 && (
                <span className="nav-badge">{categoriesList.length}</span>
              )}
            </button>

            <button
              className={`admin-nav-link ${tab === "students" ? "active" : ""}`}
              onClick={() => {
                setTab("students");
                setMobileNavOpen(false);
              }}
            >
              <div className="nav-left">
                <span className="nav-icon">👥</span>
                <span>Students</span>
              </div>
              {studentsTotal > 0 && <span className="nav-badge">{studentsTotal}</span>}
            </button>

            <button
              className={`admin-nav-link ${tab === "orders" ? "active" : ""}`}
              onClick={() => {
                setTab("orders");
                setMobileNavOpen(false);
              }}
            >
              <div className="nav-left">
                <span className="nav-icon">💳</span>
                <span>Orders</span>
              </div>
              {ordersTotal > 0 && <span className="nav-badge">{ordersTotal}</span>}
            </button>

            <button
              className={`admin-nav-link ${tab === "services" ? "active" : ""}`}
              onClick={() => {
                setTab("services");
                setMobileNavOpen(false);
              }}
            >
              <div className="nav-left">
                <span className="nav-icon">⚡</span>
                <span>Services & APIs</span>
              </div>
            </button>

            <button
              className={`admin-nav-link ${tab === "settings" ? "active" : ""}`}
              onClick={() => {
                setTab("settings");
                setMobileNavOpen(false);
              }}
            >
              <div className="nav-left">
                <span className="nav-icon">⚙️</span>
                <span>Settings & Security</span>
              </div>
            </button>

            <div style={{ margin: "16px 0 8px", borderTop: "1px solid rgba(255,255,255,0.08)" }} />

            <Link
              href="https://www.webturelab.com"
              target="_blank"
              className="admin-nav-link"
              style={{ color: "#94a3b8" }}
            >
              <div className="nav-left">
                <span className="nav-icon">↗</span>
                <span>Visit Bookstore</span>
              </div>
            </Link>
          </nav>
        </div>

        <div className="admin-sidebar-footer">
          <div className="admin-user-card">
            <div className="admin-user-info">
              <strong>{user?.name || "Administrator"}</strong>
              <span>{user?.email}</span>
            </div>
            <button
              className="btn outline small"
              onClick={logout}
              title="Sign out of Admin Portal"
              style={{ padding: "6px 10px", fontSize: "11px", borderColor: "rgba(255,255,255,0.2)", color: "#fff" }}
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="admin-content-area">
        {/* Top Sticky Header */}
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              className="btn outline small"
              id="mobile-nav-toggle"
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              aria-label="Toggle admin menu"
            >
              ☰ Menu
            </button>
            <div className="admin-topbar-title">
              <h1>
                {tab === "overview" && "Dashboard Overview"}
                {tab === "books" && "eBooks Catalogue Management"}
                {tab === "add-book" && "Add New eBook"}
                {tab === "categories" && "Categories Management"}
                {tab === "students" && "Registered Students"}
                {tab === "orders" && "Orders & Transactions"}
                {tab === "services" && "Services & Infrastructure Health"}
                {tab === "settings" && "Admin Settings & Security"}
              </h1>
              <p>
                {tab === "overview" && "High-level metrics, sales, recent registrations and merchandising summary."}
                {tab === "books" && "View, edit, search, and merchandise eBooks across the store."}
                {tab === "add-book" && "Upload eBook metadata, cover art to Cloudinary, and PDF to Cloudflare R2 in one flow."}
                {tab === "categories" && "Create and manage custom categories for eBooks with live storefront grouping."}
                {tab === "students" && "Inspect enrolled students, purchase entitlements, and account statuses."}
                {tab === "orders" && "Audit verified Razorpay payments, transaction amounts, and reference keys."}
                {tab === "services" && "Inspect live connection state for Cloudflare R2, Cloudinary, Razorpay, Brevo and MongoDB."}
                {tab === "settings" && "Manage administrator credentials, change login password, and store launch maintenance."}
              </p>
            </div>
          </div>

          <div className="admin-topbar-actions">
            {tab === "books" && (
              <button className="btn small" onClick={() => setTab("add-book")}>
                + Add New eBook
              </button>
            )}
            {tab === "categories" && (
              <button
                className="btn small"
                onClick={() => {
                  const el = document.getElementById("new-category-form");
                  el?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                + Add Category
              </button>
            )}
            <Link className="btn outline small" href="/" target="_blank">
              View Storefront ↗
            </Link>
          </div>
        </header>

        {/* View Body */}
        <div className="admin-view-body">
          {error && <p className="form-error" style={{ marginBottom: "20px" }}>{error}</p>}
          {successMsg && <p className="form-success" style={{ marginBottom: "20px" }}>{successMsg}</p>}

          {/* VIEW: OVERVIEW */}
          {tab === "overview" && stats && (
            <>
              <div className="dashboard-stats admin-stats" style={{ marginTop: 0 }}>
                {[
                  ["STUDENTS", stats.students],
                  ["TOTAL EBOOKS", stats.books],
                  ["TOTAL ORDERS", stats.orders],
                  ["TOTAL REVENUE", money(stats.revenue)],
                  ["CATEGORIES", stats.categoriesCount ?? categoriesList.length],
                ].map(([label, value]: any) => (
                  <div key={label} style={{ borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <span>{label}</span>
                    <strong style={{ color: "#10245b" }}>{value}</strong>
                  </div>
                ))}
              </div>

              <div className="admin-overview-grid" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "24px", marginBottom: "24px" }}>
                <section className="admin-card-box">
                  <div className="admin-card-header">
                    <h2>Recent Orders</h2>
                    <button className="textlink" onClick={() => setTab("orders")}>
                      View all orders →
                    </button>
                  </div>
                  {stats.recentOrders && stats.recentOrders.length > 0 ? (
                    <OrderTable orders={stats.recentOrders.slice(0, 5)} />
                  ) : (
                    <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
                      No recent orders recorded yet.
                    </p>
                  )}
                </section>

                <section className="admin-card-box">
                  <div className="admin-card-header">
                    <h2>Recent Students</h2>
                    <button className="textlink" onClick={() => setTab("students")}>
                      View all students →
                    </button>
                  </div>
                  {stats.recentStudents && stats.recentStudents.length > 0 ? (
                    stats.recentStudents.slice(0, 6).map((s: any) => (
                      <div className="admin-row" key={s._id} style={{ padding: "10px 0" }}>
                        <div className="admin-row-main">
                          <strong>{s.name}</strong>
                          <span style={{ fontSize: "11px" }}>{s.email}</span>
                        </div>
                        <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                          {new Date(s.createdAt).toLocaleDateString("en-IN")}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
                      No students registered yet.
                    </p>
                  )}
                </section>
              </div>

              <section className="admin-card-box">
                <div className="admin-card-header">
                  <h2>Store Bestsellers & Top Performing Guides</h2>
                  <button className="textlink" onClick={() => setTab("books")}>
                    Manage catalogue →
                  </button>
                </div>
                {stats.bestsellers && stats.bestsellers.length > 0 ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
                    {stats.bestsellers.map((b: any) => (
                      <div
                        key={b.title}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px",
                          padding: "16px",
                          background: "#f8fafc",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}
                      >
                        <div>
                          <strong>{b.title}</strong>
                          <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px" }}>
                            {b.sales} copies sold · {money(b.sellingPrice)}
                          </div>
                        </div>
                        <span style={{ background: "#ffc629", color: "#10245b", fontSize: "10px", fontWeight: "700", padding: "4px 8px", borderRadius: "4px" }}>
                          Bestseller
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
                    No bestseller sales recorded yet.
                  </p>
                )}
              </section>
            </>
          )}

          {/* VIEW: BOOKS */}
          {tab === "books" && (
            <div className="admin-card-box">
              <div className="admin-card-header">
                <h2>eBook Catalogue ({booksTotal} Guides)</h2>
                <button className="btn small" onClick={() => setTab("add-book")}>
                  + Add New eBook
                </button>
              </div>

              <div className="catalogue-tools" style={{ marginBottom: "20px" }}>
                <input
                  placeholder="Search title, author, description…"
                  value={bookQuery}
                  onChange={e => {
                    setBookQuery(e.target.value);
                    setBooksPage(1);
                  }}
                />
                <select
                  value={bookCategory}
                  onChange={e => {
                    setBookCategory(e.target.value);
                    setBooksPage(1);
                  }}
                >
                  <option value="">All categories</option>
                  {categoriesList.map(c => (
                    <option key={c._id || c.name} value={c.name}>
                      {c.name} {c.count ? `(${c.count})` : ""}
                    </option>
                  ))}
                </select>
                <select
                  value={bookStatus}
                  onChange={e => {
                    setBookStatus(e.target.value);
                    setBooksPage(1);
                  }}
                >
                  <option value="">All statuses</option>
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="unpublished">Unpublished</option>
                </select>
                <select
                  value={bookSort}
                  onChange={e => {
                    setBookSort(e.target.value);
                    setBooksPage(1);
                  }}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="title_asc">Title (A-Z)</option>
                  <option value="price_asc">Price (Low to High)</option>
                  <option value="price_desc">Price (High to Low)</option>
                </select>
              </div>

              {books.length > 0 ? (
                books.map(b => (
                  <div className="admin-row" key={b._id}>
                    <div className="admin-row-top">
                      <Cover
                        book={b}
                        className="admin-book-cover"
                        style={{ width: 60, minWidth: 60, maxWidth: 60, height: 85, flexShrink: 0 }}
                      />
                      <div className="admin-row-main">
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <strong style={{ fontSize: "14.5px", color: "var(--dark)" }}>{b.title}</strong>
                          {b.tag && (
                            <span
                              style={{
                                background: b.tag === "Bestseller" ? "#ffc629" : "#e0e7ff",
                                color: b.tag === "Bestseller" ? "#10245b" : "#3730a3",
                                fontSize: "10px",
                                fontWeight: "700",
                                padding: "2px 6px",
                                borderRadius: "4px",
                              }}
                            >
                              {b.tag}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: "700",
                              textTransform: "uppercase",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: b.status === "published" ? "#d1fae5" : "#fef3c7",
                              color: b.status === "published" ? "#065f46" : "#92400e",
                            }}
                          >
                            {b.status}
                          </span>
                        </div>
                        <span style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
                          Category: <strong>{b.category}</strong> · Price: <strong>{money(b.sellingPrice)}</strong> (MSRP: {money(b.originalPrice)})
                          {b.pages ? ` · ${b.pages} pages` : ""}
                        </span>
                        <span style={{ fontSize: "12px" }}>
                          {b.pdfFileName ? (
                            <span style={{ color: "#065f46", fontWeight: "600" }}>
                              ✓ PDF: {b.pdfFileName} {b.pdfSize ? `(${(b.pdfSize / 1048576).toFixed(1)} MB)` : ""}
                            </span>
                          ) : (
                            <span style={{ color: "#b94c2a", fontWeight: "600" }}>
                              ⚠ No PDF attached (Cannot be purchased until uploaded)
                            </span>
                          )}
                          <span style={{ color: "var(--muted)" }}>
                            {b.thumbnailUrl ? " · Custom Cover (Cloudinary)" : " · Default Cover"}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="admin-actions">
                      {/* Merchandising Quick Toggles */}
                      <button
                        className="btn outline small"
                        style={{
                          background: b.tag === "Bestseller" ? "#ffc629" : "transparent",
                          borderColor: "#ffc629",
                          color: "#10245b",
                          fontWeight: "700",
                        }}
                        title="Toggle Bestseller badge on storefront homepage"
                        onClick={async () => {
                          try {
                            await api(`/admin/books/${b._id}/toggle-bestseller`, { method: "PATCH" });
                            showNotification(`Updated Bestseller status for "${b.title}"`);
                            setRefresh(x => x + 1);
                          } catch (e: any) {
                            setError(e.message);
                          }
                        }}
                      >
                        ⭐ {b.tag === "Bestseller" ? "Bestseller ✓" : "Bestseller"}
                      </button>

                      <button
                        className="btn outline small"
                        style={{
                          background: b.tag === "New" ? "#e0e7ff" : "transparent",
                          borderColor: "#818cf8",
                          color: "#3730a3",
                          fontWeight: "700",
                        }}
                        title="Toggle New Arrival badge on storefront homepage"
                        onClick={async () => {
                          try {
                            await api(`/admin/books/${b._id}/toggle-new`, { method: "PATCH" });
                            showNotification(`Updated New Arrival status for "${b.title}"`);
                            setRefresh(x => x + 1);
                          } catch (e: any) {
                            setError(e.message);
                          }
                        }}
                      >
                        ✨ {b.tag === "New" ? "New ✓" : "New"}
                      </button>

                      <button
                        className="btn outline small"
                        onClick={() => setEditing(b)}
                      >
                        Edit Details
                      </button>

                      <UploadButton
                        book={b}
                        kind="pdf"
                        onDone={() => {
                          showNotification("PDF updated successfully in Cloudflare R2!");
                          setRefresh(x => x + 1);
                        }}
                      />

                      <UploadButton
                        book={b}
                        kind="cover"
                        onDone={() => {
                          showNotification("Cover updated successfully in Cloudinary!");
                          setRefresh(x => x + 1);
                        }}
                      />

                      <button
                        className="btn outline small"
                        onClick={async () => {
                          try {
                            const newStatus = b.status === "published" ? "unpublished" : "published";
                            await api(`/admin/books/${b._id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ status: newStatus }),
                            });
                            showNotification(`Status updated to ${newStatus}`);
                            setRefresh(x => x + 1);
                          } catch (e: any) {
                            setError(e.message);
                          }
                        }}
                      >
                        {b.status === "published" ? "Unpublish" : "Publish"}
                      </button>

                      <button
                        className="btn outline small"
                        style={{ color: "#b94c2a", borderColor: "#fca5a5" }}
                        onClick={async () => {
                          if (!window.confirm(`Delete "${b.title}"? This cannot be undone.`)) return;
                          try {
                            await api(`/admin/books/${b._id}?force=true`, {
                              method: "DELETE",
                            });
                            showNotification(`"${b.title}" deleted.`);
                            setRefresh(x => x + 1);
                          } catch (e: any) {
                            setError(e.message);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p style={{ color: "var(--muted)", fontStyle: "italic", padding: "15px 0" }}>
                  No books found matching the selected filters.
                </p>
              )}

              {booksTotalPages > 1 && (
                <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "24px" }}>
                  <button
                    className="btn outline small"
                    disabled={booksPage <= 1}
                    onClick={() => setBooksPage(p => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span style={{ alignSelf: "center", fontSize: "12px", color: "var(--muted)" }}>
                    Page {booksPage} of {booksTotalPages}
                  </span>
                  <button
                    className="btn outline small"
                    disabled={booksPage >= booksTotalPages}
                    onClick={() => setBooksPage(p => Math.min(booksTotalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}

          {/* VIEW: ADD NEW EBOOK (UNIFIED FLOW) */}
          {tab === "add-book" && (
            <AddBookFull
              categories={categoriesList}
              onSuccess={created => {
                showNotification(`eBook "${created.title}" successfully created and saved!`);
                setRefresh(x => x + 1);
                setTab("books");
              }}
              onCancel={() => setTab("books")}
              onAddCategoryClick={() => setTab("categories")}
            />
          )}

          {/* VIEW: CATEGORIES MANAGEMENT */}
          {tab === "categories" && (
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: "24px", alignItems: "start" }}>
              <section className="admin-card-box">
                <div className="admin-card-header">
                  <h2>Live Categories ({categoriesList.length})</h2>
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                    Editable & dynamic groupings
                  </span>
                </div>

                {categoriesList.length > 0 ? (
                  categoriesList.map(c => (
                    <div className="admin-row" key={c._id || c.name} style={{ padding: "14px 0" }}>
                      <div className="admin-row-main">
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <strong>{c.name}</strong>
                          <span style={{ fontSize: "11px", background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>
                            slug: {c.slug}
                          </span>
                        </div>
                        <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                          {c.description || "No description provided."}
                        </span>
                        <span style={{ fontSize: "11px", fontWeight: "600", color: "#10245b" }}>
                          {c.count || 0} eBook{c.count === 1 ? "" : "s"} assigned
                        </span>
                      </div>

                      <div className="admin-actions">
                        <button
                          className="btn outline small"
                          onClick={() => {
                            setCatEditing(c);
                            setCatName(c.name);
                            setCatDesc(c.description || "");
                            setCatOrder(c.displayOrder || 0);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn outline small"
                          style={{ color: "#b94c2a", borderColor: "#fca5a5" }}
                          onClick={async () => {
                            if (c.count > 0) {
                              alert(`Cannot delete category "${c.name}" because it currently has ${c.count} eBook(s) assigned. Reassign or delete those books first.`);
                              return;
                            }
                            if (!window.confirm(`Delete category "${c.name}"?`)) return;
                            try {
                              await api(`/admin/categories/${c._id}`, { method: "DELETE" });
                              showNotification(`Category "${c.name}" deleted.`);
                              setRefresh(x => x + 1);
                            } catch (e: any) {
                              setError(e.message);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
                    No categories found. Create one using the form on the right.
                  </p>
                )}
              </section>

              {/* Add / Edit Category Form */}
              <section className="admin-card-box" id="new-category-form">
                <div className="admin-card-header">
                  <h2>{catEditing ? `Edit Category: ${catEditing.name}` : "Create New Category"}</h2>
                  {catEditing && (
                    <button
                      className="textlink"
                      onClick={() => {
                        setCatEditing(null);
                        setCatName("");
                        setCatDesc("");
                        setCatOrder(0);
                      }}
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <form
                  onSubmit={async e => {
                    e.preventDefault();
                    if (!catName.trim()) return;
                    setCatBusy(true);
                    setError("");
                    try {
                      if (catEditing) {
                        await api(`/admin/categories/${catEditing._id}`, {
                          method: "PATCH",
                          body: JSON.stringify({
                            name: catName.trim(),
                            description: catDesc.trim(),
                            displayOrder: Number(catOrder || 0),
                          }),
                        });
                        showNotification(`Category "${catName}" updated.`);
                        setCatEditing(null);
                      } else {
                        await api("/admin/categories", {
                          method: "POST",
                          body: JSON.stringify({
                            name: catName.trim(),
                            description: catDesc.trim(),
                            displayOrder: Number(catOrder || 0),
                          }),
                        });
                        showNotification(`Category "${catName}" created.`);
                      }
                      setCatName("");
                      setCatDesc("");
                      setCatOrder(0);
                      setRefresh(x => x + 1);
                    } catch (err: any) {
                      setError(err.message);
                    } finally {
                      setCatBusy(false);
                    }
                  }}
                  style={{ display: "grid", gap: "14px" }}
                >
                  <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
                    Category Name
                    <input
                      required
                      placeholder="e.g. Artificial Intelligence"
                      value={catName}
                      onChange={e => setCatName(e.target.value)}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
                    Description
                    <textarea
                      placeholder="e.g. Practical guides to prompt engineering, neural networks and modern tools."
                      value={catDesc}
                      onChange={e => setCatDesc(e.target.value)}
                      style={{ minHeight: "80px" }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
                    Display Order
                    <input
                      type="number"
                      placeholder="0"
                      value={catOrder}
                      onChange={e => setCatOrder(Number(e.target.value))}
                    />
                  </label>

                  <button className="btn" disabled={catBusy} style={{ marginTop: "8px" }}>
                    {catBusy ? "Saving…" : catEditing ? "Update Category" : "+ Add Category"}
                  </button>
                </form>
              </section>
            </div>
          )}

          {/* VIEW: STUDENTS */}
          {tab === "students" && (
            <div className="admin-card-box">
              <div className="admin-card-header">
                <h2>Registered Students ({studentsTotal})</h2>
              </div>

              <div className="catalogue-tools" style={{ marginBottom: "20px" }}>
                <input
                  placeholder="Search students by name, email, phone…"
                  value={studentQuery}
                  onChange={e => {
                    setStudentQuery(e.target.value);
                    setStudentsPage(1);
                  }}
                />
                <select
                  value={studentStatus}
                  onChange={e => {
                    setStudentStatus(e.target.value);
                    setStudentsPage(1);
                  }}
                >
                  <option value="">All statuses</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              {students.length > 0 ? (
                students.map(s => (
                  <div className="admin-row" key={s._id}>
                    <div className="admin-row-main">
                      <strong>{s.name}</strong>
                      <span>
                        {s.email} · Phone: {s.phone || "—"}
                      </span>
                      <span>
                        Email: {s.emailVerified ? "Verified ✓" : "Unverified"} · Account:{" "}
                        <strong style={{ color: s.accountStatus === "active" ? "#065f46" : "#b94c2a" }}>
                          {s.accountStatus}
                        </strong>{" "}
                        · Joined: {new Date(s.createdAt).toLocaleDateString("en-IN")}
                      </span>
                    </div>
                    <div className="admin-actions">
                      <button
                        className="btn outline small"
                        onClick={async () => {
                          try {
                            const r = await api<any>(`/admin/students/${s._id}/purchases`);
                            setStudentPurchases({ student: s, purchases: r.items });
                          } catch (e: any) {
                            setError(e.message);
                          }
                        }}
                      >
                        Purchased eBooks
                      </button>
                      <button
                        className="btn outline small"
                        onClick={async () => {
                          const newStatus = s.accountStatus === "active" ? "suspended" : "active";
                          if (!window.confirm(`${newStatus === "suspended" ? "Suspend" : "Activate"} account for ${s.name}?`)) return;
                          try {
                            await api(`/admin/students/${s._id}/status`, {
                              method: "PATCH",
                              body: JSON.stringify({ status: newStatus }),
                            });
                            showNotification(`Account ${newStatus} for ${s.name}`);
                            setRefresh(x => x + 1);
                          } catch (e: any) {
                            setError(e.message);
                          }
                        }}
                      >
                        {s.accountStatus === "active" ? "Suspend" : "Restore"}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p style={{ color: "var(--muted)", fontStyle: "italic", padding: "15px 0" }}>
                  No students match the criteria.
                </p>
              )}

              {studentsTotalPages > 1 && (
                <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "24px" }}>
                  <button
                    className="btn outline small"
                    disabled={studentsPage <= 1}
                    onClick={() => setStudentsPage(p => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span style={{ alignSelf: "center", fontSize: "12px", color: "var(--muted)" }}>
                    Page {studentsPage} of {studentsTotalPages}
                  </span>
                  <button
                    className="btn outline small"
                    disabled={studentsPage >= studentsTotalPages}
                    onClick={() => setStudentsPage(p => Math.min(studentsTotalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}

          {/* VIEW: ORDERS */}
          {tab === "orders" && (
            <div className="admin-card-box">
              <div className="admin-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <h2 style={{ margin: 0 }}>Verified Orders & Transactions ({ordersTotal})</h2>
                  <small style={{ color: "var(--muted)" }}>Live payments and verified transaction records</small>
                </div>
                {orders.length > 0 && (
                  <button
                    className="btn outline small"
                    onClick={handleClearAllOrders}
                    style={{ color: "#dc2626", borderColor: "#fca5a5" }}
                  >
                    🗑️ Remove Dummy Orders
                  </button>
                )}
              </div>

              <div className="catalogue-tools" style={{ marginBottom: "20px" }}>
                <input
                  placeholder="Search by order ID, Razorpay ID, eBook title…"
                  value={orderQuery}
                  onChange={e => {
                    setOrderQuery(e.target.value);
                    setOrdersPage(1);
                  }}
                />
                <select
                  value={orderStatus}
                  onChange={e => {
                    setOrderStatus(e.target.value);
                    setOrdersPage(1);
                  }}
                >
                  <option value="">All payment statuses</option>
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                  <option value="created">Created</option>
                  <option value="failed">Failed</option>
                  <option value="refunded">Refunded</option>
                </select>
              </div>

              {orders.length > 0 ? (
                <OrderTable orders={orders} onDelete={handleDeleteOrder} />
              ) : (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)" }}>
                  <p style={{ fontSize: "28px", margin: "0 0 10px" }}>✅</p>
                  <p style={{ fontWeight: 600, color: "#1e293b", margin: "0 0 6px" }}>No orders in database</p>
                  <p style={{ fontSize: "13px", margin: 0 }}>All dummy orders have been cleared. Storefront is ready for live customer purchases!</p>
                </div>
              )}

              {ordersTotalPages > 1 && (
                <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "24px" }}>
                  <button
                    className="btn outline small"
                    disabled={ordersPage <= 1}
                    onClick={() => setOrdersPage(p => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span style={{ alignSelf: "center", fontSize: "12px", color: "var(--muted)" }}>
                    Page {ordersPage} of {ordersTotalPages}
                  </span>
                  <button
                    className="btn outline small"
                    disabled={ordersPage >= ordersTotalPages}
                    onClick={() => setOrdersPage(p => Math.min(ordersTotalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}

          {/* VIEW: SERVICES & APIS HEALTH */}
          {tab === "services" && (
            <div>
              <div className="admin-card-box">
                <div className="admin-card-header">
                  <h2>Cloud & API Integrations Status</h2>
                  <button className="btn outline small" onClick={() => setRefresh(x => x + 1)}>
                    ↻ Refresh Health
                  </button>
                </div>

                <p style={{ fontSize: "13px", color: "var(--muted)", margin: "0 0 16px" }}>
                  This dashboard monitors connection health and cloud infrastructure services for Digital Bizware.
                </p>

                <div className="services-status-grid">
                  {/* MongoDB Atlas */}
                  <div className={`service-status-card ${servicesStatus?.mongodb?.status === "Connected" ? "active" : "dev-mode"}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: "15px" }}>MongoDB Atlas</strong>
                      <span className={`service-status-pill ${servicesStatus?.mongodb?.status === "Connected" ? "active" : "dev"}`}>
                        {servicesStatus?.mongodb?.status === "Connected" ? "CONNECTED" : "OFFLINE"}
                      </span>
                    </div>
                    <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                      Primary Database: Users, Books, Orders, Purchases
                    </span>
                    <span style={{ fontSize: "11px", fontWeight: "600", color: "#10245b" }}>
                      Provider: {servicesStatus?.mongodb?.provider || "MongoDB Atlas"}
                    </span>
                  </div>

                  {/* Cloudflare R2 */}
                  <div className={`service-status-card ${servicesStatus?.r2?.configured ? "active" : "dev-mode"}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: "15px" }}>Cloudflare R2</strong>
                      <span className={`service-status-pill ${servicesStatus?.r2?.configured ? "active" : "dev"}`}>
                        {servicesStatus?.r2?.configured ? "ACTIVE" : "STANDBY STORAGE"}
                      </span>
                    </div>
                    <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                      Private eBook PDFs Storage. Download authorized only after verified payment.
                    </span>
                    <span style={{ fontSize: "11px", fontWeight: "600", color: "#10245b" }}>
                      {servicesStatus?.r2?.provider || "Local Secure Storage"}
                    </span>
                    <small style={{ fontSize: "10px", color: "#64748b" }}>
                      Requires: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
                    </small>
                  </div>

                  {/* Cloudinary */}
                  <div className={`service-status-card ${servicesStatus?.cloudinary?.configured ? "active" : "dev-mode"}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: "15px" }}>Cloudinary CDN</strong>
                      <span className={`service-status-pill ${servicesStatus?.cloudinary?.configured ? "active" : "dev"}`}>
                        {servicesStatus?.cloudinary?.configured ? "ACTIVE" : "LOCAL CACHE"}
                      </span>
                    </div>
                    <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                      Cover Image CDN and image asset delivery.
                    </span>
                    <span style={{ fontSize: "11px", fontWeight: "600", color: "#10245b" }}>
                      {servicesStatus?.cloudinary?.provider || "Local Disk Storage"}
                    </span>
                    <small style={{ fontSize: "10px", color: "#64748b" }}>
                      Requires: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
                    </small>
                  </div>

                  {/* Razorpay */}
                  <div className={`service-status-card ${servicesStatus?.razorpay?.configured ? "active" : "dev-mode"}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: "15px" }}>Razorpay Gateway</strong>
                      <span className={`service-status-pill ${servicesStatus?.razorpay?.configured ? "active" : "dev"}`}>
                        {servicesStatus?.razorpay?.configured ? "ACTIVE" : "SANDBOX GATEWAY"}
                      </span>
                    </div>
                    <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                      Payment processing, signature verification, and order checkout.
                    </span>
                    <span style={{ fontSize: "11px", fontWeight: "600", color: "#10245b" }}>
                      {servicesStatus?.razorpay?.provider || "Sandbox Gateway"}
                    </span>
                    <small style={{ fontSize: "10px", color: "#64748b" }}>
                      Requires: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
                    </small>
                  </div>

                  {/* Brevo */}
                  <div className={`service-status-card ${servicesStatus?.brevo?.configured ? "active" : "dev-mode"}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: "15px" }}>Brevo Emails</strong>
                      <span className={`service-status-pill ${servicesStatus?.brevo?.configured ? "active" : "dev"}`}>
                        {servicesStatus?.brevo?.configured ? "ACTIVE" : "LOG DISPATCH"}
                      </span>
                    </div>
                    <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                      Welcome emails, password resets, and purchase confirmations.
                    </span>
                    <span style={{ fontSize: "11px", fontWeight: "600", color: "#10245b" }}>
                      {servicesStatus?.brevo?.provider || "Transactional Dispatcher"}
                    </span>
                    <small style={{ fontSize: "10px", color: "#64748b" }}>
                      Requires: BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME
                    </small>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: SETTINGS & SECURITY */}
          {tab === "settings" && (
            <div>
              {/* Admin Profile Information */}
              <div className="admin-card-box">
                <div className="admin-card-header">
                  <div>
                    <h2>Administrator Account Profile</h2>
                    <small style={{ color: "var(--muted)" }}>Authenticated super administrator credentials</small>
                  </div>
                  <span
                    style={{
                      background: "#ecfdf5",
                      color: "#065f46",
                      padding: "4px 10px",
                      borderRadius: "20px",
                      fontSize: "12px",
                      fontWeight: "700",
                      border: "1px solid #a7f3d0"
                    }}
                  >
                    ● Active Super Administrator
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", marginTop: "16px" }}>
                  <div style={{ padding: "16px", background: "var(--bg-subtle, #f8fafc)", borderRadius: "8px", border: "1px solid var(--line)" }}>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", color: "var(--muted)" }}>Admin Name</span>
                    <p style={{ margin: "6px 0 0", fontSize: "15px", fontWeight: "600", color: "#1e293b" }}>{user?.name || "Digital Bizware Admin"}</p>
                  </div>
                  <div style={{ padding: "16px", background: "var(--bg-subtle, #f8fafc)", borderRadius: "8px", border: "1px solid var(--line)" }}>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", color: "var(--muted)" }}>Admin Email (Login ID)</span>
                    <p style={{ margin: "6px 0 0", fontSize: "15px", fontWeight: "600", color: "#1e293b" }}>{user?.email || "info@webturelab.com"}</p>
                  </div>
                  <div style={{ padding: "16px", background: "var(--bg-subtle, #f8fafc)", borderRadius: "8px", border: "1px solid var(--line)" }}>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", color: "var(--muted)" }}>Role & Permissions</span>
                    <p style={{ margin: "6px 0 0", fontSize: "15px", fontWeight: "600", color: "#1e293b" }}>Full Store Administrator</p>
                  </div>
                </div>
              </div>

              {/* Change Password Card */}
              <div className="admin-card-box">
                <div className="admin-card-header">
                  <div>
                    <h2>Change Admin Password</h2>
                    <small style={{ color: "var(--muted)" }}>Update your administrator login password to keep your store secure</small>
                  </div>
                </div>

                {pwError && (
                  <div style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", padding: "12px 16px", borderRadius: "8px", marginBottom: "16px", fontSize: "13px" }}>
                    ⚠️ {pwError}
                  </div>
                )}
                {pwSuccess && (
                  <div style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", padding: "12px 16px", borderRadius: "8px", marginBottom: "16px", fontSize: "13px" }}>
                    ✓ {pwSuccess}
                  </div>
                )}

                <form onSubmit={handlePasswordChange} style={{ maxWidth: "540px", display: "grid", gap: "18px" }}>
                  <div className="form-field">
                    <label style={{ fontSize: "13px", fontWeight: "700", color: "#1e293b", marginBottom: "6px", display: "block" }}>
                      Current Password *
                    </label>
                    <div className="password-wrap">
                      <input
                        required
                        type={showCurrentPw ? "text" : "password"}
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowCurrentPw(!showCurrentPw)}
                        aria-label="Toggle password visibility"
                      >
                        {showCurrentPw ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>

                  <div className="form-field">
                    <label style={{ fontSize: "13px", fontWeight: "700", color: "#1e293b", marginBottom: "6px", display: "block" }}>
                      New Password * <span style={{ fontSize: "11px", fontWeight: "normal", color: "var(--muted)" }}>(min 8 characters)</span>
                    </label>
                    <div className="password-wrap">
                      <input
                        required
                        type={showNewPw ? "text" : "password"}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Enter new strong password"
                        minLength={8}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowNewPw(!showNewPw)}
                        aria-label="Toggle password visibility"
                      >
                        {showNewPw ? "Hide" : "Show"}
                      </button>
                    </div>
                    {newPassword && (
                      <div style={{ marginTop: "6px", fontSize: "12px", display: "flex", gap: "12px" }}>
                        <span style={{ color: newPassword.length >= 8 ? "#16a34a" : "#dc2626" }}>
                          {newPassword.length >= 8 ? "✓" : "✗"} 8+ chars
                        </span>
                        <span style={{ color: /[0-9!@#$%^&*]/.test(newPassword) ? "#16a34a" : "#ca8a04" }}>
                          {/[0-9!@#$%^&*]/.test(newPassword) ? "✓" : "○"} Number or Symbol
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="form-field">
                    <label style={{ fontSize: "13px", fontWeight: "700", color: "#1e293b", marginBottom: "6px", display: "block" }}>
                      Confirm New Password *
                    </label>
                    <div className="password-wrap">
                      <input
                        required
                        type={showConfirmPw ? "text" : "password"}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        minLength={8}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowConfirmPw(!showConfirmPw)}
                        aria-label="Toggle password visibility"
                      >
                        {showConfirmPw ? "Hide" : "Show"}
                      </button>
                    </div>
                    {confirmPassword && newPassword !== confirmPassword && (
                      <span style={{ color: "#dc2626", fontSize: "12px", marginTop: "4px" }}>
                        Passwords do not match
                      </span>
                    )}
                  </div>

                  <div style={{ marginTop: "10px" }}>
                    <button
                      type="submit"
                      className="btn btn-yellow"
                      disabled={pwBusy}
                      style={{ padding: "10px 24px", fontWeight: 700 }}
                    >
                      {pwBusy ? "Updating Password…" : "Update Password"}
                    </button>
                  </div>
                </form>
              </div>

              {/* Real Store Launch & Dummy Orders Management */}
              <div className="admin-card-box">
                <div className="admin-card-header">
                  <div>
                    <h2>Store Launch & Order Maintenance</h2>
                    <small style={{ color: "var(--muted)" }}>Clean dummy orders or test transactions before or after production launch</small>
                  </div>
                </div>

                <div style={{ padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
                  <div>
                    <strong style={{ fontSize: "14px", color: "#1e293b", display: "block" }}>Order Database Status</strong>
                    <span style={{ fontSize: "13px", color: ordersTotal === 0 ? "#16a34a" : "#ca8a04", fontWeight: 600 }}>
                      {ordersTotal === 0 ? "✓ Clean Database (0 Dummy Orders - Ready for Real Customers)" : `⚠️ ${ordersTotal} orders currently recorded in database`}
                    </span>
                  </div>
                  <button
                    className="btn outline small"
                    onClick={handleClearAllOrders}
                    disabled={ordersTotal === 0}
                    style={{
                      color: ordersTotal === 0 ? "#94a3b8" : "#dc2626",
                      borderColor: ordersTotal === 0 ? "#cbd5e1" : "#fca5a5",
                      cursor: ordersTotal === 0 ? "not-allowed" : "pointer"
                    }}
                  >
                    🗑️ Clear Dummy Orders
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Book Modal */}
      {editing && (
        <EditBook
          book={editing}
          categories={categoriesList}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            showNotification(`Updated "${editing.title}"`);
            setRefresh(x => x + 1);
          }}
        />
      )}

      {/* Student Purchases Inspection Modal */}
      {studentPurchases && (
        <PurchaseModal
          data={studentPurchases}
          onClose={() => setStudentPurchases(null)}
          onRevoke={async (id: string) => {
            await api(`/admin/purchases/${id}/revoke`, {
              method: "PATCH",
              body: JSON.stringify({}),
            });
            const r = await api<any>(
              `/admin/students/${studentPurchases.student._id}/purchases`
            );
            setStudentPurchases({ ...studentPurchases, purchases: r.items });
            showNotification("Access revoked for selected eBook.");
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UNIFIED ADD BOOK COMPONENT (Single Flow: Metadata + Cloudinary Cover + Cloudflare R2 PDF)
// ---------------------------------------------------------------------------
function AddBookFull({
  categories,
  onSuccess,
  onCancel,
  onAddCategoryClick,
}: {
  categories: any[];
  onSuccess: (book: BookRecord) => void;
  onCancel: () => void;
  onAddCategoryClick: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // File states
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  // Form states
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState(categories[0]?.name || "Digital Marketing");
  const [pages, setPages] = useState<number>(140);
  const [originalPrice, setOriginalPrice] = useState<number>(799);
  const [sellingPrice, setSellingPrice] = useState<number>(499);
  const [description, setDescription] = useState("");
  const [tableOfContents, setTableOfContents] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [status, setStatus] = useState<"draft" | "published" | "unpublished">("published");

  // Merchandising placement options
  const [isBestseller, setIsBestseller] = useState(false);
  const [isNewArrival, setIsNewArrival] = useState(true);
  const [customTag, setCustomTag] = useState("");

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Cover image must be a PNG, JPG or WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Cover image must be under 5 MB.");
      return;
    }
    setError("");
    setCoverFile(file);
    const url = URL.createObjectURL(file);
    setCoverPreview(url);
  };

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Digital asset must be an authentic PDF file.");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("PDF file exceeds maximum limit of 100 MB.");
      return;
    }
    setError("");
    setPdfFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (sellingPrice > originalPrice) {
      setError("Selling price cannot exceed original price (MSRP).");
      return;
    }
    if (!title.trim()) {
      setError("Please provide an eBook title.");
      return;
    }
    if (!author.trim()) {
      setError("Please provide the author name.");
      return;
    }
    if (!category.trim()) {
      setError("Please select a category.");
      return;
    }
    if (!description.trim() || description.trim().length < 10) {
      setError("Description must be at least 10 characters long.");
      return;
    }
    if (status === "published" && !pdfFile) {
      setError("Please attach a PDF file before publishing, or save as Draft.");
      return;
    }

    setBusy(true);
    setUploadProgress(10);

    const fd = new FormData();
    fd.append("title", title.trim());
    fd.append("subtitle", subtitle.trim());
    fd.append("author", author.trim());
    fd.append("category", category.trim());
    fd.append("pages", String(pages));
    fd.append("originalPrice", String(originalPrice));
    fd.append("sellingPrice", String(sellingPrice));
    fd.append("description", description.trim());
    fd.append("status", status);
    fd.append("tableOfContents", tableOfContents);
    fd.append("preview", previewText);

    // Merchandising tags
    if (isBestseller) fd.append("isBestseller", "true");
    if (isNewArrival) fd.append("isNewArrival", "true");
    if (customTag.trim()) fd.append("tag", customTag.trim());

    if (coverFile) fd.append("cover", coverFile);
    if (pdfFile) fd.append("pdf", pdfFile);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/admin/books/create-full`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-Classes-Request", "web");
    const authToken = getAuthToken();
    if (authToken) xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);

    xhr.upload.onprogress = event => {
      if (event.lengthComputable) {
        const pct = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(Math.min(95, Math.max(10, pct)));
      }
    };

    xhr.onload = () => {
      setBusy(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        setUploadProgress(100);
        try {
          const res = JSON.parse(xhr.responseText);
          onSuccess(res);
        } catch {
          onSuccess({} as any);
        }
      } else {
        let msg = "Failed to create eBook";
        try {
          msg = JSON.parse(xhr.responseText).error || msg;
        } catch {}
        setError(msg);
      }
    };

    xhr.onerror = () => {
      setBusy(false);
      setError("Network error occurred while uploading. Please check connection.");
    };

    xhr.send(fd);
  };

  return (
    <div className="admin-card-box">
      <div className="admin-card-header">
        <div>
          <h2>Add New eBook (Unified Single-Step Flow)</h2>
          <p style={{ fontSize: "12px", color: "var(--muted)", margin: "4px 0 0" }}>
            Add book details, cover image (Cloudinary), and original PDF (Cloudflare R2) in one seamless step.
          </p>
        </div>
        <button type="button" className="btn outline small" onClick={onCancel}>
          ✕ Cancel
        </button>
      </div>

      {error && <p className="form-error" style={{ marginBottom: "16px" }}>{error}</p>}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "22px" }}>
        {/* Step 1: Basic Information */}
        <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "18px", margin: 0 }}>
          <legend style={{ fontWeight: "700", color: "#10245b", fontSize: "14px", padding: "0 8px" }}>
            1. Basic Information
          </legend>

          <div className="form-grid">
            <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
              Book Title *
              <input
                required
                placeholder="e.g. The Complete SEO Handbook"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </label>

            <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
              Subtitle / Edition
              <input
                placeholder="e.g. A modern working handbook for founders"
                value={subtitle}
                onChange={e => setSubtitle(e.target.value)}
              />
            </label>

            <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
              Author Name *
              <input
                required
                placeholder="e.g. Aarav Bhatia"
                value={author}
                onChange={e => setAuthor(e.target.value)}
              />
            </label>

            <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
              Category *
              <div style={{ display: "flex", gap: "8px" }}>
                <select
                  required
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  style={{ flex: 1 }}
                >
                  {categories.map(c => (
                    <option key={c._id || c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn outline small"
                  onClick={onAddCategoryClick}
                  title="Create a new category"
                  style={{ whiteSpace: "nowrap" }}
                >
                  + New
                </button>
              </div>
            </label>

            <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
              Number of Pages
              <input
                type="number"
                min="1"
                placeholder="140"
                value={pages}
                onChange={e => setPages(Number(e.target.value))}
              />
            </label>

            <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
              Publication Status
              <select
                value={status}
                onChange={e => setStatus(e.target.value as any)}
              >
                <option value="published">Published (Live for purchase immediately)</option>
                <option value="draft">Draft (Saved privately)</option>
                <option value="unpublished">Unpublished (Hidden from storefront)</option>
              </select>
            </label>
          </div>
        </fieldset>

        {/* Step 2: Pricing & Homepage Merchandising */}
        <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "18px", margin: 0 }}>
          <legend style={{ fontWeight: "700", color: "#10245b", fontSize: "14px", padding: "0 8px" }}>
            2. Pricing & Homepage Placement (Like Ergocraft)
          </legend>

          <div className="form-grid" style={{ marginBottom: "16px" }}>
            <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
              Original MSRP Price (₹) *
              <input
                type="number"
                min="0"
                required
                value={originalPrice}
                onChange={e => setOriginalPrice(Number(e.target.value))}
              />
            </label>

            <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
              Selling Discount Price (₹) *
              <input
                type="number"
                min="0"
                required
                value={sellingPrice}
                onChange={e => setSellingPrice(Number(e.target.value))}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", padding: "12px 16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <label className="switch-label">
              <input
                type="checkbox"
                checked={isBestseller}
                onChange={e => {
                  setIsBestseller(e.target.checked);
                  if (e.target.checked) setIsNewArrival(false);
                }}
              />
              <span>🌟 Show as Bestseller on Homepage</span>
            </label>

            <label className="switch-label">
              <input
                type="checkbox"
                checked={isNewArrival}
                onChange={e => {
                  setIsNewArrival(e.target.checked);
                  if (e.target.checked) setIsBestseller(false);
                }}
              />
              <span>✨ Show as New Arrival on Homepage</span>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: "600" }}>
              <span>Custom Badge:</span>
              <input
                placeholder="e.g. Editor's Pick"
                value={customTag}
                onChange={e => setCustomTag(e.target.value)}
                style={{ width: "160px", padding: "6px 10px", fontSize: "12px" }}
              />
            </label>
          </div>
        </fieldset>

        {/* Step 3: Content Details */}
        <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "18px", margin: 0 }}>
          <legend style={{ fontWeight: "700", color: "#10245b", fontSize: "14px", padding: "0 8px" }}>
            3. Description & Reader Preview
          </legend>

          <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700", marginBottom: "14px" }}>
            Book Description *
            <textarea
              required
              minLength={10}
              placeholder="Provide a comprehensive summary of what skills the student will learn from this guide…"
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={{ minHeight: "90px" }}
            />
          </label>

          <div className="form-grid">
            <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
              Table of Contents (one chapter per line)
              <textarea
                placeholder="01 Core Foundations&#10;02 Tactical Implementation&#10;03 Real-World Case Studies"
                value={tableOfContents}
                onChange={e => setTableOfContents(e.target.value)}
                style={{ minHeight: "80px" }}
              />
            </label>

            <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
              Sample Preview (excerpts shown to curious readers)
              <textarea
                placeholder="Key excerpt 1&#10;Key excerpt 2&#10;Key excerpt 3"
                value={previewText}
                onChange={e => setPreviewText(e.target.value)}
                style={{ minHeight: "80px" }}
              />
            </label>
          </div>
        </fieldset>

        {/* Step 4: Digital Assets (Cloudinary Cover + Cloudflare R2 PDF) */}
        <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "18px", margin: 0 }}>
          <legend style={{ fontWeight: "700", color: "#10245b", fontSize: "14px", padding: "0 8px" }}>
            4. Digital Assets & Storage
          </legend>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            {/* Cover Image Upload */}
            <div>
              <strong style={{ fontSize: "13px", display: "block", marginBottom: "6px" }}>
                Cover Image (Stored in Cloudinary CDN)
              </strong>
              <div className="upload-dropzone">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleCoverSelect}
                />
                <div style={{ pointerEvents: "none" }}>
                  <span style={{ fontSize: "24px", display: "block", marginBottom: "4px" }}>🖼️</span>
                  <strong style={{ fontSize: "13px", color: "#10245b" }}>
                    {coverFile ? coverFile.name : "Click or drag cover image"}
                  </strong>
                  <span style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginTop: "2px" }}>
                    PNG, JPG or WebP (max 5 MB)
                  </span>
                </div>
              </div>

              {coverPreview && (
                <div className="upload-preview-box">
                  <img src={coverPreview} alt="Selected cover" />
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <strong style={{ fontSize: "12px", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {coverFile?.name}
                    </strong>
                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                      {coverFile ? `${(coverFile.size / 1024).toFixed(1)} KB` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn outline small"
                    onClick={() => {
                      setCoverFile(null);
                      setCoverPreview("");
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            {/* PDF Upload */}
            <div>
              <strong style={{ fontSize: "13px", display: "block", marginBottom: "6px" }}>
                Original eBook PDF (Stored in Cloudflare R2 Private Bucket)
              </strong>
              <div className="upload-dropzone">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handlePdfSelect}
                />
                <div style={{ pointerEvents: "none" }}>
                  <span style={{ fontSize: "24px", display: "block", marginBottom: "4px" }}>📄</span>
                  <strong style={{ fontSize: "13px", color: "#10245b" }}>
                    {pdfFile ? pdfFile.name : "Click or drag authentic PDF file"}
                  </strong>
                  <span style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginTop: "2px" }}>
                    Authentic PDF file (max 100 MB). Accessible only after verified purchase.
                  </span>
                </div>
              </div>

              {pdfFile && (
                <div className="upload-preview-box">
                  <span style={{ fontSize: "28px" }}>📕</span>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <strong style={{ fontSize: "12px", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {pdfFile.name}
                    </strong>
                    <span style={{ fontSize: "11px", color: "#065f46", fontWeight: "600" }}>
                      ✓ {(pdfFile.size / 1048576).toFixed(2)} MB PDF ready
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn outline small"
                    onClick={() => setPdfFile(null)}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>
        </fieldset>

        {busy && (
          <div style={{ background: "#edf2f9", padding: "16px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: "700", marginBottom: "8px" }}>
              <span>Uploading assets to Cloudinary & Cloudflare R2…</span>
              <span>{uploadProgress}%</span>
            </div>
            <div style={{ height: "8px", background: "#cbd5e1", borderRadius: "4px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${uploadProgress}%`, background: "#10245b", transition: "width 0.2s ease" }} />
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button className="btn" disabled={busy} style={{ minWidth: "180px" }}>
            {busy ? `Creating eBook (${uploadProgress}%)…` : "+ Create & Publish eBook"}
          </button>
          <button type="button" className="btn outline" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ORDER TABLE
// ---------------------------------------------------------------------------
function OrderTable({ orders, onDelete }: { orders: any[]; onDelete?: (id: string) => void }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Student</th>
            <th>eBooks</th>
            <th>Amount</th>
            <th>Payment Status</th>
            <th>Razorpay Ref</th>
            <th>Date</th>
            {onDelete && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {orders.map((o: any) => (
            <tr key={o._id}>
              <td style={{ fontFamily: "monospace", fontSize: "11px" }}>
                #{String(o._id).slice(-8)}
              </td>
              <td>
                {o.userId?.name ? (
                  <>
                    <strong>{o.userId.name}</strong>
                    <br />
                    <small style={{ color: "var(--muted)" }}>{o.userId.email}</small>
                  </>
                ) : (
                  o.userId?.email || "—"
                )}
              </td>
              <td>{o.items?.map((x: any) => x.title).join(", ") || "—"}</td>
              <td>
                <strong>{money(o.totalAmount)}</strong>
              </td>
              <td>
                <span
                  style={{
                    padding: "3px 8px",
                    borderRadius: "4px",
                    fontSize: "10px",
                    fontWeight: "700",
                    textTransform: "uppercase",
                    background:
                      o.paymentStatus === "paid"
                        ? "#d1fae5"
                        : o.paymentStatus === "pending"
                        ? "#fef3c7"
                        : "#fee2e2",
                    color:
                      o.paymentStatus === "paid"
                        ? "#065f46"
                        : o.paymentStatus === "pending"
                        ? "#92400e"
                        : "#991b1b",
                  }}
                >
                  {o.paymentStatus}
                </span>
              </td>
              <td style={{ fontFamily: "monospace", fontSize: "11px", color: "var(--muted)" }}>
                {o.razorpayPaymentId || o.razorpayOrderId || "—"}
              </td>
              <td style={{ fontSize: "11px", color: "var(--muted)" }}>
                {new Date(o.createdAt).toLocaleDateString("en-IN")}
              </td>
              {onDelete && (
                <td>
                  <button
                    className="btn outline small"
                    onClick={() => onDelete(o._id)}
                    style={{ color: "#dc2626", borderColor: "#fca5a5", fontSize: "11px", padding: "3px 8px" }}
                    title="Delete order"
                  >
                    Delete
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EDIT BOOK MODAL
// ---------------------------------------------------------------------------
function EditBook({
  book,
  categories,
  onClose,
  onSaved,
}: {
  book: BookRecord;
  categories: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="modal-scrim" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="edit-modal">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: 0, fontSize: "17px", color: "#10245b" }}>Edit eBook: {book.title}</h3>
          <button className="btn outline small" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        <div style={{ padding: "20px 24px" }}>
          {/* File management strip */}
          <div style={{ display: "flex", gap: "16px", alignItems: "center", padding: "14px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "20px" }}>
            <img
              src={coverUrl(book)}
              alt="Current cover"
              style={{ width: "54px", height: "72px", objectFit: "cover", borderRadius: "4px", border: "1px solid #e2e8f0" }}
            />
            <div style={{ flex: 1, fontSize: "12px" }}>
              <div style={{ marginBottom: "4px" }}>
                <strong>Cloudflare R2 PDF:</strong>{" "}
                {book.pdfFileName ? (
                  <span style={{ color: "#065f46", fontWeight: "600" }}>
                    {book.pdfFileName} {book.pdfSize ? `(${(book.pdfSize / 1048576).toFixed(1)} MB)` : ""}
                  </span>
                ) : (
                  <span style={{ color: "#b94c2a" }}>No PDF uploaded yet</span>
                )}
              </div>
              <div>
                <strong>Cloudinary Cover:</strong>{" "}
                <span>{book.thumbnailUrl ? "Custom Cloudinary URL active" : "Default catalog cover"}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <UploadButton book={book} kind="pdf" onDone={onSaved} />
              <UploadButton book={book} kind="cover" onDone={onSaved} />
            </div>
          </div>

          <form
            onSubmit={async e => {
              e.preventDefault();
              setError("");
              const f = new FormData(e.currentTarget);
              const v: any = Object.fromEntries(f);
              v.originalPrice = Number(v.originalPrice);
              v.sellingPrice = Number(v.sellingPrice);
              v.pages = Number(v.pages || 0);

              if (v.sellingPrice > v.originalPrice) {
                setError("Selling price cannot exceed original price.");
                return;
              }

              v.tableOfContents = String(v.tableOfContents || "")
                .split("\n")
                .map(s => s.trim())
                .filter(Boolean);
              v.preview = String(v.preview || "")
                .split("\n")
                .map(s => s.trim())
                .filter(Boolean);

              setBusy(true);
              try {
                await api(`/admin/books/${book._id}`, {
                  method: "PATCH",
                  body: JSON.stringify(v),
                });
                onSaved();
              } catch (x: any) {
                setError(x.message);
              } finally {
                setBusy(false);
              }
            }}
            style={{ display: "grid", gap: "14px" }}
          >
            <div className="form-grid">
              <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
                Title
                <input required name="title" defaultValue={book.title} />
              </label>
              <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
                Subtitle
                <input name="subtitle" defaultValue={book.subtitle} />
              </label>
              <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
                Author
                <input required name="author" defaultValue={book.author} />
              </label>
              <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
                Category
                <select name="category" defaultValue={book.category}>
                  {categories.map(c => (
                    <option key={c._id || c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
                Original Price (₹)
                <input type="number" min="0" required name="originalPrice" defaultValue={book.originalPrice} />
              </label>
              <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
                Selling Price (₹)
                <input type="number" min="0" required name="sellingPrice" defaultValue={book.sellingPrice} />
              </label>
              <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
                Publication Status
                <select name="status" defaultValue={book.status || "draft"}>
                  <option value="draft">Draft</option>
                  <option value="published" disabled={!book.pdfUploaded && !book.pdfFileName}>
                    Published {!book.pdfUploaded && !book.pdfFileName ? "(Attach PDF first)" : ""}
                  </option>
                  <option value="unpublished">Unpublished</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
                Homepage Tag
                <select name="tag" defaultValue={book.tag || ""}>
                  <option value="">No special tag</option>
                  <option value="Bestseller">⭐ Bestseller</option>
                  <option value="New">✨ New Arrival</option>
                </select>
              </label>
            </div>

            <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
              Description
              <textarea
                name="description"
                required
                minLength={10}
                defaultValue={book.description}
                style={{ minHeight: "80px" }}
              />
            </label>

            <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
              Table of contents (one chapter per line)
              <textarea
                name="tableOfContents"
                defaultValue={book.tableOfContents?.join("\n")}
                style={{ minHeight: "70px" }}
              />
            </label>

            <label style={{ display: "grid", gap: "6px", fontSize: "12px", fontWeight: "700" }}>
              Sample preview (one excerpt per line)
              <textarea
                name="preview"
                defaultValue={book.preview?.join("\n")}
                style={{ minHeight: "70px" }}
              />
            </label>

            {error && <p className="form-error">{error}</p>}

            <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
              <button className="btn" disabled={busy}>
                {busy ? "Saving changes…" : "Save Changes"}
              </button>
              <button type="button" className="btn outline" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UPLOAD BUTTON (Used for individual quick file updates)
// ---------------------------------------------------------------------------
function UploadButton({
  book,
  kind,
  onDone,
}: {
  book: BookRecord;
  kind: "pdf" | "cover";
  onDone: () => void;
}) {
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  return (
    <label className="upload-button" style={{ position: "relative", cursor: busy ? "not-allowed" : "pointer", borderRadius: "4px" }}>
      {busy
        ? `${kind.toUpperCase()} ${progress}%`
        : success
        ? `${kind === "pdf" ? "PDF" : "Cover"} ✓`
        : kind === "pdf"
        ? "📄 Upload PDF"
        : "🖼️ Upload Cover"}
      <input
        type="file"
        accept={kind === "pdf" ? "application/pdf" : "image/png,image/jpeg,image/webp"}
        disabled={busy}
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
        onChange={async e => {
          const file = e.target.files?.[0];
          if (!file) return;
          setError("");
          setProgress(0);
          setBusy(true);
          setSuccess(false);

          const xhr = new XMLHttpRequest();
          xhr.open("POST", `${API}/admin/books/${book._id}/upload-${kind}`);
          xhr.withCredentials = true;
          xhr.setRequestHeader("X-Classes-Request", "web");
          const authToken = getAuthToken();
          if (authToken) xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);

          xhr.upload.onprogress = event => {
            if (event.lengthComputable) {
              setProgress(Math.round((event.loaded / event.total) * 100));
            }
          };

          xhr.onload = () => {
            setBusy(false);
            if (xhr.status >= 200 && xhr.status < 300) {
              setSuccess(true);
              setTimeout(() => setSuccess(false), 3000);
              onDone();
            } else {
              let msg = "Upload failed";
              try {
                msg = JSON.parse(xhr.responseText).error || msg;
              } catch {}
              setError(msg);
            }
          };

          xhr.onerror = () => {
            setBusy(false);
            setError("Upload connection failed");
          };

          const fd = new FormData();
          fd.append("file", file);
          xhr.send(fd);
          e.currentTarget.value = "";
        }}
      />
      {error && <small style={{ color: "#b94c2a", marginLeft: "8px" }}>{error}</small>}
    </label>
  );
}

// ---------------------------------------------------------------------------
// PURCHASE MODAL (Inspect Student Purchases)
// ---------------------------------------------------------------------------
function PurchaseModal({
  data,
  onClose,
  onRevoke,
}: {
  data: any;
  onClose: () => void;
  onRevoke: (id: string) => Promise<void>;
}) {
  return (
    <div className="modal-scrim" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="edit-modal">
        <div style={{ padding: "24px" }}>
          <div className="dashboard-heading" style={{ marginBottom: "20px" }}>
            <div>
              <div className="eyebrow">STUDENT PURCHASES</div>
              <h2>{data.student.name}</h2>
              <p>{data.student.email} · Phone: {data.student.phone || "—"}</p>
            </div>
            <button className="btn outline small" onClick={onClose}>
              ✕ Close
            </button>
          </div>

          {data.purchases.length ? (
            data.purchases.map((p: any) => (
              <div className="admin-row" key={p._id}>
                <div className="admin-row-main">
                  <strong>{p.bookId?.title || "Deleted eBook"}</strong>
                  <span>
                    Amount: {money(p.amountPaid)} · Payment status: {p.orderId?.paymentStatus || "paid"} · Date:{" "}
                    {new Date(p.purchasedAt).toLocaleDateString("en-IN")}
                  </span>
                  <span>
                    Access status:{" "}
                    <strong
                      style={{
                        color: p.entitlementStatus === "active" ? "#065f46" : "#b94c2a",
                      }}
                    >
                      {p.entitlementStatus}
                    </strong>
                  </span>
                </div>
                {p.entitlementStatus === "active" && (
                  <button
                    className="btn outline small"
                    onClick={() => {
                      if (window.confirm("Revoke this student's access to this eBook?")) {
                        onRevoke(p._id);
                      }
                    }}
                  >
                    Revoke access
                  </button>
                )}
              </div>
            ))
          ) : (
            <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
              No purchases recorded for this student.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
