-- Meta Ads como plataforma de canal (Zernio crea una cuenta 'metaads' aparte al
-- conectar Facebook con ads) + foto de perfil de la cuenta conectada.
alter type public.channel_platform add value if not exists 'metaads';
alter table public.messaging_channels add column if not exists photo_url text;
