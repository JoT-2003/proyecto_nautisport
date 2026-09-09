import flet as ft

# ==========================================
# 1. LÓGICA DE NEGOCIO
# ==========================================
class Cliente:
    def __init__(self, nombre, telefono, mail):
        self.nombre = nombre
        self.telefono = telefono 
        self.mail = mail

class Fechas:
    def __init__(self, fec_rep, fec_ent):
        self.fec_rep = fec_rep
        self.fec_ent = fec_ent
        
    @staticmethod
    def defecto():
        return "Comercial Top Impex Ltda\nRut: 79.918.870-8"

class Boleta(Fechas, Cliente):
    def __init__(self, nombre, telefono, mail, fec_rep, fec_ent, orden):
        Cliente.__init__(self, nombre, telefono, mail)
        Fechas.__init__(self, fec_rep, fec_ent)
        self.orden = orden 

    def datos(self):
        return (
            f"=== {self.defecto()} ===\n"
            f"N° Orden: {self.orden}\n"
            f"Recepción: {self.fec_rep} | Entrega: {self.fec_ent}\n"
            f"----------------------------------------\n"
            f"Cliente: {self.nombre}\n"
            f"Teléfono: {self.telefono}\n"
            f"Email: {self.mail}\n"
            f"========================================"
        )

# ==========================================
# 2. INTERFAZ GRÁFICA (FLET)
# ==========================================
def main(page: ft.Page):
    page.title = "NautiSport"
    page.padding = 20
    page.scroll = "adaptive"

    # Título y subtítulo sencillos
    txt_titulo = ft.Text("Proyecto NautiSport", size=24, weight="bold")
    txt_subtitulo = ft.Text("Generador de Boletas", size=14)

    # Campos de texto de entrada
    tf_orden = ft.TextField(label="N° Orden")
    tf_nombre = ft.TextField(label="Nombre Cliente")
    tf_telefono = ft.TextField(label="Teléfono")
    tf_mail = ft.TextField(label="Correo Electrónico")
    tf_fec_rep = ft.TextField(label="Fecha Recepción")
    tf_fec_ent = ft.TextField(label="Fecha Entrega")

    # Resultado de la boleta
    txt_resultado = ft.Text("Completa el formulario y presiona 'Generar Boleta'", size=13)
    
    container_resultado = ft.Container(
    content=txt_resultado,
    padding=15,
    border=ft.Border.all(1, "grey") # <--- Con 'Border' en mayúscula
)

    def generar_click(e):
        if not all([tf_orden.value, tf_nombre.value, tf_telefono.value, tf_mail.value]):
            txt_resultado.value = "⚠️ Por favor completa los campos principales (Orden, Nombre, Teléfono, Mail)."
            page.update()
            return

        boleta = Boleta(
            nombre=tf_nombre.value,
            telefono=tf_telefono.value,
            mail=tf_mail.value,
            fec_rep=tf_fec_rep.value,
            fec_ent=tf_fec_ent.value,
            orden=tf_orden.value
        )

        txt_resultado.value = boleta.datos()
        page.update()

    btn_generar = ft.ElevatedButton(
        "Generar Boleta", 
        on_click=generar_click
    )

    # Añadimos los elementos
    page.add(
        txt_titulo,
        txt_subtitulo,
        ft.Divider(),
        tf_orden,
        tf_nombre,
        tf_telefono,
        tf_mail,
        tf_fec_rep,
        tf_fec_ent,
        btn_generar,
        ft.Divider(),
        container_resultado
    )

    # Forzar la actualización gráfica inicial
    page.update()

ft.app(target=main)