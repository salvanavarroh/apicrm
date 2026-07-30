-- Foto de perfil del contacto (IG/FB) en la conversación del inbox.
-- WhatsApp no la expone → queda null y el avatar cae a las iniciales.
alter table public.conversations add column if not exists participant_photo_url text;
