-- Plataformas de ads adicionales que Zernio soporta conectar (OAuth real):
-- TikTok Ads (tiktok-ads → business-api.tiktok.com) y Google Ads (google-ads →
-- scope adwords). Alimentan el panel de Rendimiento de Ads (no son canales de inbox).
alter type public.channel_platform add value if not exists 'tiktok';
alter type public.channel_platform add value if not exists 'google';
