declare module "@pagefind/default-ui" {
	declare class PagefindUI {
		constructor(arg: unknown);
	}
}

interface ImportMetaEnv {
	readonly RECORD_SECRET?: string;
	readonly R2_ACCOUNT_ID?: string;
	readonly R2_ACCESS_KEY_ID?: string;
	readonly R2_SECRET_ACCESS_KEY?: string;
	readonly R2_BUCKET_NAME?: string;
	readonly R2_PUBLIC_URL?: string;
	readonly OPENAI_API_KEY?: string;
	readonly TURSO_DATABASE_URL?: string;
	readonly TURSO_AUTH_TOKEN?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
