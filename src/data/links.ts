export type Lang = "en" | "ar";

export type LocalizedText = Record<Lang, string>;

export type SocialIconLink = {
	friendlyName: LocalizedText;
	href: string;
	hrefByLang?: Partial<Record<Lang, string>>;
	icon: string;
};

export type ProfileLink = {
	description: LocalizedText;
	href: string;
	hrefByLang?: Partial<Record<Lang, string>>;
	icon: string;
	title: LocalizedText;
};

export const phoneDisplay = "+20 106 509 3575";
export const phoneHref = "tel:+201065093575";
export const telegramHref = "https://t.me/alifadda1";

const whatsappMessage: LocalizedText = {
	ar: "مرحبا علي، السلام عليكم",
	en: "Hello Ali, Assalamu Alaikum",
};

export function whatsappHref(lang: Lang = "en") {
	return `https://wa.me/201065093575?text=${encodeURIComponent(whatsappMessage[lang])}`;
}

export const pageCopy = {
	ar: {
		author: "علي فضه",
		bio: "مهندس برمجيات أول متخصص في الـ Backend. أبني أنظمة NestJS وTemporal وتكاملات الذكاء الاصطناعي، وأوصلها إلى الإنتاج.",
		description:
			"روابط علي فضه — السيرة الذاتية، واتساب، تيليجرام، لينكدإن، والمزيد في مكان واحد.",
		langLabel: "العربية",
		switchTo: "English",
		switchToHref: "/links",
		title: "روابط",
	},
	en: {
		author: "Ali Fadda",
		bio: "Senior software backend engineer. NestJS, Temporal, LLM integrations, and systems that ship.",
		description:
			"Links for Ali Fadda — resume, WhatsApp, Telegram, LinkedIn, and more in one place.",
		langLabel: "English",
		switchTo: "العربية",
		switchToHref: "/links?lang=ar",
		title: "Links",
	},
} as const;

/** Icon row under the bio — keep this short. */
export const socialIcons: SocialIconLink[] = [
	{
		friendlyName: { ar: "جيت هب", en: "GitHub" },
		href: "https://github.com/alifadda-me",
		icon: "mdi:github",
	},
	{
		friendlyName: { ar: "لينكدإن", en: "LinkedIn" },
		href: "https://www.linkedin.com/in/alifadda/",
		icon: "mdi:linkedin",
	},
	{
		friendlyName: { ar: "فيسبوك", en: "Facebook" },
		href: "https://www.facebook.com/ali.fadda.81787/",
		icon: "mdi:facebook",
	},
	{
		friendlyName: { ar: "واتساب", en: "WhatsApp" },
		href: whatsappHref("en"),
		hrefByLang: { ar: whatsappHref("ar"), en: whatsappHref("en") },
		icon: "mdi:whatsapp",
	},
	{
		friendlyName: { ar: "تيليجرام", en: "Telegram" },
		href: telegramHref,
		icon: "mdi:telegram",
	},
	{
		friendlyName: { ar: "الهاتف", en: "Phone" },
		href: phoneHref,
		icon: "mdi:phone",
	},
	{
		friendlyName: { ar: "البريد", en: "Email" },
		href: "mailto:contact@alifadda.me",
		icon: "mdi:email",
	},
];

/**
 * Main link buttons. Add entries here as you publish more destinations.
 * Order is display order — put the thing you want clicked first at the top.
 */
export const profileLinks: ProfileLink[] = [
	{
		description: {
			ar: "الخبرات والمهارات وبيانات التواصل",
			en: "Experience, skills, and contact details",
		},
		href: "/resume",
		icon: "mdi:file-document-outline",
		title: { ar: "السيرة الذاتية", en: "Resume" },
	},
	{
		description: {
			ar: "رسالة جاهزة — مرحبا علي، السلام عليكم",
			en: "Say hello — opens a chat",
		},
		href: whatsappHref("en"),
		hrefByLang: { ar: whatsappHref("ar"), en: whatsappHref("en") },
		icon: "mdi:whatsapp",
		title: { ar: "واتساب", en: "WhatsApp" },
	},
	{
		description: { ar: "@alifadda1", en: "@alifadda1" },
		href: telegramHref,
		icon: "mdi:telegram",
		title: { ar: "تيليجرام", en: "Telegram" },
	},
	{
		description: {
			ar: phoneDisplay,
			en: phoneDisplay,
		},
		href: phoneHref,
		icon: "mdi:phone-outline",
		title: { ar: "اتصل بي", en: "Call me" },
	},
	{
		description: {
			ar: "الخبرة المهنية والتحديثات",
			en: "Work history and professional updates",
		},
		href: "https://www.linkedin.com/in/alifadda/",
		icon: "mdi:linkedin",
		title: { ar: "لينكدإن", en: "LinkedIn" },
	},
	{
		description: {
			ar: "الأكواد والمشاريع المفتوحة",
			en: "Code and open-source work",
		},
		href: "https://github.com/alifadda-me",
		icon: "mdi:github",
		title: { ar: "جيت هب", en: "GitHub" },
	},
	{
		description: {
			ar: "تحديثات ومنشورات شخصية",
			en: "Personal updates and posts",
		},
		href: "https://www.facebook.com/ali.fadda.81787/",
		icon: "mdi:facebook",
		title: { ar: "فيسبوك", en: "Facebook" },
	},
	{
		description: {
			ar: "contact@alifadda.me",
			en: "contact@alifadda.me",
		},
		href: "mailto:contact@alifadda.me",
		icon: "mdi:email-outline",
		title: { ar: "البريد الإلكتروني", en: "Email" },
	},
];

export function isExternal(href: string) {
	return href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:");
}
