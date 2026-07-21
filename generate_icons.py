import os
import subprocess
import sys

# Intentar importar Pillow, si no está, instalarlo
try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Instalando Pillow para generar los iconos de la PWA...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image, ImageDraw

def create_icon(size, filename):
    # Crear una imagen negra absoluta (OLED black)
    image = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    draw = ImageDraw.Draw(image)
    
    # Dibujar un círculo verde fluorescente (#39FF14) en el centro que represente un karting o una rueda / limón
    margin = size // 6
    draw.ellipse(
        [margin, margin, size - margin, size - margin],
        outline=(57, 255, 20, 255),
        width=max(2, size // 30)
    )
    
    # Dibujar una letra 'L' estilizada (de Limoneh) en amarillo neón
    font_size = size // 3
    # Intentar dibujar una línea o forma simple en el centro
    # Una "L" inclinada y moderna o un rayo
    # Dibujaremos un triángulo/flecha que represente velocidad
    c = size // 2
    offset = size // 10
    draw.polygon([
        (c - offset, c - offset * 1.5),
        (c + offset * 1.5, c),
        (c - offset, c + offset * 1.5),
        (c - offset * 0.5, c)
    ], fill=(255, 230, 0, 255)) # neonYellow
    
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    image.save(filename, "PNG")
    print(f"Icono creado: {filename} ({size}x{size})")

if __name__ == "__main__":
    create_icon(192, "icons/icon-192.png")
    create_icon(512, "icons/icon-512.png")
