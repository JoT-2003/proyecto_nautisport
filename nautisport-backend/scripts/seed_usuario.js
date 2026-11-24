// Seed de usuarios iniciales (RBAC).
// Uso: node scripts/seed_usuario.js
// Crea/actualiza (por email) un usuario por rol, todos con la contraseña indicada abajo.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../db');

const USUARIOS = [
  { nombre: 'Administrador NautiSport', email: 'admin@nautisport.cl', rol: 'Administrador' },
  { nombre: 'Recepción NautiSport', email: 'recepcion@nautisport.cl', rol: 'Recepcion' },
  { nombre: 'Técnico NautiSport', email: 'tecnico@nautisport.cl', rol: 'Tecnico' },
];

const PASSWORD_DEMO = process.env.DEMO_PASSWORD;
if (!PASSWORD_DEMO) {
  console.error('❌ Define DEMO_PASSWORD en nautisport-backend/.env antes de crear usuarios.');
  process.exit(1);
}

(async () => {
  const hash = await bcrypt.hash(PASSWORD_DEMO, 10);

  for (const u of USUARIOS) {
    await pool.query(
      `
      INSERT INTO usuario (nombre, email, password_hash, rol)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO UPDATE
        SET nombre = EXCLUDED.nombre,
            rol = EXCLUDED.rol,
            password_hash = EXCLUDED.password_hash,
            activo = TRUE;
      `,
      [u.nombre, u.email, hash, u.rol]
    );
    console.log(`✔ ${u.rol}: ${u.email}`);
  }

  console.log(`\nContraseña para todos los usuarios demo: ${PASSWORD_DEMO}`);
  console.log('⚠️  Cambia estas credenciales antes de usar el sistema en producción.');
  process.exit(0);
})().catch((error) => {
  console.error('Error en el seed:', error.message);
  process.exit(1);
});
