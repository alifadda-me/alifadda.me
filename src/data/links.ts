export type SocialIconLink = {
	friendlyName: string;
	href: string;
	icon: string;
};

export type ProfileLink = {
	description?: string;
	href: string;
	icon: string;
	title: string;
};

const whatsappMessage = encodeURIComponent("Hello Ali, Assalamu Alaikum");
const whatsappHref = `https://wa.me/201065093575?text=${whatsappMessage}`;
const telegramHref = "https://t.me/alifadda1";

/** Icon row under the bio — keep this short. */
export const socialIcons: SocialIconLink[] = [
	{
		friendlyName: "GitHub",
		href: "https://github.com/alifadda-me",
		icon: "mdi:github",
	},
	{
		friendlyName: "LinkedIn",
		href: "https://www.linkedin.com/in/alifadda/",
		icon: "mdi:linkedin",
	},
	{
		friendlyName: "Facebook",
		href: "https://www.facebook.com/ali.fadda.81787/",
		icon: "mdi:facebook",
	},
	{
		friendlyName: "WhatsApp",
		href: whatsappHref,
		icon: "mdi:whatsapp",
	},
	{
		friendlyName: "Telegram",
		href: telegramHref,
		icon: "mdi:telegram",
	},
	{
		friendlyName: "Email",
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
		description: "Experience, skills, and contact details",
		href: "/resume",
		icon: "mdi:file-document-outline",
		title: "Resume",
	},
	{
		description: "Say hello — opens a chat",
		href: whatsappHref,
		icon: "mdi:whatsapp",
		title: "WhatsApp",
	},
	{
		description: "@alifadda1",
		href: telegramHref,
		icon: "mdi:telegram",
		title: "Telegram",
	},
	{
		description: "Work history and professional updates",
		href: "https://www.linkedin.com/in/alifadda/",
		icon: "mdi:linkedin",
		title: "LinkedIn",
	},
	{
		description: "Code and open-source work",
		href: "https://github.com/alifadda-me",
		icon: "mdi:github",
		title: "GitHub",
	},
	{
		description: "Personal updates and posts",
		href: "https://www.facebook.com/ali.fadda.81787/",
		icon: "mdi:facebook",
		title: "Facebook",
	},
	{
		description: "contact@alifadda.me",
		href: "mailto:contact@alifadda.me",
		icon: "mdi:email-outline",
		title: "Email",
	},
];
