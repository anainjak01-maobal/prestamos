"""Saca la columna ADICIONALES de la hoja GANANCIAS del Excel y genera `adicionales-excel.json`.

La app lo carga en Más → Importar adicionales del Excel. Solo agrega esas líneas como
"adicionales históricos" (ya cobrados); no borra ni cambia nada más.

Uso (en la carpeta del proyecto):
    python herramientas/adicionales_a_app.py

El archivo tiene datos reales y NO está cifrado: no subirlo a GitHub (está en .gitignore)
y borrarlo después de importarlo.
"""
import datetime as dt
import json
import sys
import warnings
from pathlib import Path

import openpyxl

warnings.filterwarnings("ignore")
RAIZ = Path(__file__).resolve().parent.parent
EXCEL = RAIZ / "CONTROL DE COBROS.xlsm"
SALIDA = RAIZ / "adicionales-excel.json"


def main():
    wb = openpyxl.load_workbook(EXCEL, data_only=True)
    g = wb["GANANCIAS"]
    lineas, fuera = [], []
    for fila in range(6, 300):
        nombre, monto, estado = g.cell(fila, 11).value, g.cell(fila, 12).value, g.cell(fila, 13).value
        if not (nombre or monto):
            continue
        nombre = str(nombre or "").strip()
        if not isinstance(monto, (int, float)):
            # Valor escrito fuera de la columna Monto: el Excel no lo suma.
            fuera.append(f"fila {fila}: {nombre} · {estado}")
            continue
        valor = int(round(monto))
        # Los negativos fueron cuadres de cuenta; el usuario confirmó (2026-11-12) que todos los demás ya se pagaron.
        nota = "Cuadre de cuenta" if valor < 0 else "Pagó"
        lineas.append({"fila": fila, "nombre": nombre or "—", "valor": valor, "nota": nota})

    total = sum(l["valor"] for l in lineas)
    datos = {
        "app": "control-de-cobros",
        "tipo": "adicionales-excel",
        "generado": dt.datetime.now().isoformat(timespec="seconds"),
        "origen": EXCEL.name,
        "total": total,
        "lineas": lineas,
    }
    SALIDA.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(lineas)} líneas, total {total:,}".replace(",", "."))
    if fuera:
        print("No se incluyen (el valor no está en la columna Monto):", *fuera, sep="\n  ")
    print(f"Archivo: {SALIDA}")


if __name__ == "__main__":
    sys.exit(main())
