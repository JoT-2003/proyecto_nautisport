-- Crear el usuario para el backend
CREATE USER app_nautisport WITH PASSWORD 'ClaveSeguraNauti2026!';

-- Otorgar privilegios sobre la base de datos y esquema
GRANT ALL PRIVILEGES ON DATABASE nautisport_db TO app_nautisport;
GRANT ALL ON SCHEMA public TO app_nautisport;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_nautisport;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_nautisport;