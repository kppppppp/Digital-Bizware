export const defaultCategories = [
  "Digital Marketing",
  "Computer Courses",
  "English Speaking",
  "IT courses",
  "Graphic Design",
] as const;
export const categories = defaultCategories;
export type Category = string;

export interface CategoryRecord {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  count?: number;
}

export interface BookRecord {
  _id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  category: string;
  originalPrice: number;
  sellingPrice: number;
  rating: number;
  reviewCount: number;
  tag?: string;
  pages: number;
  subtitle: string;
  coverImageUrl: string;
  thumbnailUrl?: string;
  cloudinaryPublicId?: string;
  pdfFileName?: string;
  pdfSize?: number;
  pdfUploaded?: boolean;
  availableForPurchase?: boolean;
  preview: string[];
  tableOfContents: string[];
  status?: "draft" | "published" | "unpublished";
}

const rows: [string, string, string, number, number, number, string?][] = [
  ["The Complete Digital Marketing Playbook", "A practical framework for building a measurable, customer-first digital marketing engine.", "Ananya Mehta", 799, 549, 4.8, "Bestseller"],
  ["Social Media Marketing Mastery", "Plan a consistent social presence, make useful content and understand what performs.", "Rohan Desai", 699, 449, 4.7],
  ["Performance Marketing & Paid Advertising", "Learn to structure, test and improve paid campaigns across today’s major platforms.", "Priya Nair", 899, 649, 4.8, "New"],
  ["Content Marketing That Converts", "A clear approach to stories, useful content and journeys that turn attention into action.", "Kavya Iyer", 599, 399, 4.6],
  ["Email Marketing & Automation", "Build thoughtful email programmes with segmentation, automation and better measurement.", "Arjun Kapoor", 499, 349, 4.7, "New"],
  ["Advanced Excel for Professionals", "Move beyond everyday spreadsheets with powerful, reliable workflows for work.", "Neha Kulkarni", 799, 599, 4.8, "Bestseller"],
  ["Excel Formulas & Functions Handbook", "A useful reference to the functions that solve common and complex business problems.", "Meera Shah", 499, 299, 4.6],
  ["Excel Dashboards & Data Visualization", "Turn raw numbers into clear dashboards that help teams make better decisions.", "Siddharth Rao", 699, 449, 4.7, "New"],
  ["Power Query & Data Analysis", "Clean, combine and refresh data with repeatable Power Query techniques.", "Divya Menon", 799, 549, 4.8, "Bestseller"],
  ["Excel VBA & Automation", "Automate repetitive spreadsheet tasks and build maintainable VBA solutions.", "Vikram Sethi", 899, 699, 4.6],
  ["The Complete Cyber Security Handbook", "Understand core security principles, everyday risks and practical defensive habits.", "Ishita Bose", 899, 649, 4.8, "Bestseller"],
  ["Ethical Hacking: Beginner to Advanced", "A responsible, structured introduction to penetration testing and security thinking.", "Kabir Khanna", 999, 749, 4.7, "New"],
  ["Network Security Fundamentals", "Learn how networks are protected, monitored and strengthened against threats.", "Aditi Verma", 699, 499, 4.6],
  ["Practical Linux Security", "Harden Linux systems with clear, hands-on guidance for administrators and learners.", "Karan Malhotra", 599, 399, 4.7],
  ["Cyber Security & Threat Intelligence", "Use threat intelligence to understand adversaries and improve security decisions.", "Nisha Thomas", 899, 699, 4.8, "New"],
  ["The Complete SEO Handbook", "A field guide to technical foundations, relevant content and sustainable organic growth.", "Aarav Bhatia", 799, 549, 4.8, "Bestseller"],
  ["Technical SEO Mastery", "Improve crawlability, site health and structured data with a methodical SEO toolkit.", "Sana Qureshi", 899, 649, 4.7, "New"],
  ["Keyword Research & Content Strategy", "Find meaningful search opportunities and turn them into a focused content plan.", "Rahul Menon", 599, 399, 4.6],
  ["Link Building & Authority Growth", "Earn relevant links through useful assets, relationships and sound outreach.", "Tanya Roy", 699, 499, 4.7],
  ["Local SEO for Business Growth", "Help nearby customers find your business with stronger local search fundamentals.", "Devika Pillai", 499, 329, 4.8, "New"],
];

export const seedBooks = rows.map((r, i) => {
  const title = r[0];
  const slug = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return {
    slug,
    title,
    description: r[1],
    author: r[2],
    category: defaultCategories[Math.floor(i / 5)],
    originalPrice: r[3],
    sellingPrice: r[4],
    rating: r[5],
    tag: r[6] || "",
    pages: 128 + ((i * 17) % 160),
    subtitle: ["A practical guide for the next step", "Clear ideas. Useful skills.", "A field guide for curious minds", "A modern working handbook"][i % 4],
    coverImageKey: "assets/ebook-cover.png",
    preview: ["Start with the foundations", "Build your working toolkit", "Put the method into practice"],
    tableOfContents: ["Start with the foundations", "Build your working toolkit", "Put the method into practice", "Measure, refine and improve", "Your next steps"],
    status: "published" as const,
  };
});
