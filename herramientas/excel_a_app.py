"""Convierte 'CONTROL DE COBROS.xlsm' en un archivo que la app puede importar (Más → Importar desde Excel).

Uso (en la carpeta PRESTAMOS):
    python herramientas/excel_a_app.py
    python herramientas/excel_a_app.py "otra ruta/CONTROL DE COBROS.xlsm"

Genera 'migracion-excel.json' (SIN cifrar, contiene datos reales: no subir a GitHub,
borrarlo después de importar). Qué se importa:
  * CLIENTES                      → clientes
  * RESUMEN + ESTADOS             → préstamos activos, con cada pago en su fecha real
  * GANANCIAS (estado "Pagó")     → préstamos ya pagados (historial de ganancias; fecha de pago aproximada)
  * GANANCIAS B2:C4               → socios con su aporte de capital
No se importa (queda en el reporte para revisar a mano): la lista de "ADICIONALES"
(no tiene fecha ni préstamo) y los "Pendiente" de GANANCIAS que no están en RESUMEN.
"""
import collections
import datetime as dt
import difflib
import json
import random
import string
import sys
import time
import unicodedata
import warnings
from pathlib import Path

import openpyxl

warnings.filterwarnings("ignore")
BASE = Path(__file__).resolve().parent.parent
XLSM = Path(sys.argv[1]) if len(sys.argv) > 1 else BASE / "CONTROL DE COBROS.xlsm"
SALIDA = BASE / "migracion-excel.json"
HOY = dt.date.today()
CUOTAS_DEFECTO = {"Diario": 30, "Semanal": 4, "Quincenal": 2, "Mensual": 1}


def js_round(x):
    """Igual que Math.round de JavaScript (para que los totales coincidan con la app)."""
    return int(x + 0.5) if x >= 0 else -int(-x + 0.5)


def norm(s):
    return unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().strip().lower()


def uid():
    return format(int(time.time() * 1000), "x") + "".join(random.choices(string.ascii_lowercase + string.digits, k=6))


def ymd(d):
    return d.strftime("%Y-%m-%d")


def as_date(v):
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    return None


def texto_num(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def interes(capital, tasa):
    return js_round(capital * tasa / 100)


def cuota_sugerida(capital, tasa, n):
    total = capital + interes(capital, tasa)
    if n < 1:
        return total
    c = total / n
    return -(-int(c * 100) // 10000) * 100 if total >= 10000 else -(-total // n)


def add_months(d, n):
    m = d.month - 1 + n
    y = d.year + m // 12
    m = m % 12 + 1
    import calendar
    return dt.date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def fin_plazo(fecha, modalidad, n):
    if modalidad == "Semanal":
        return fecha + dt.timedelta(days=7 * n)
    if modalidad == "Quincenal":
        return fecha + dt.timedelta(days=15 * n)
    if modalidad == "Mensual":
        return add_months(fecha, n)
    return fecha + dt.timedelta(days=n)


def main():
    wb = openpyxl.load_workbook(XLSM, data_only=True)
    reporte = {"avisos": [], "no_importado": []}
    ts = int(time.time() * 1000)

    # ---------------- Clientes ----------------
    clientes, por_codigo, por_nombre = [], {}, {}
    for r in wb["CLIENTES"].iter_rows(min_row=5, values_only=True):
        cod, nombre = r[1], r[2]
        if not cod or not nombre:
            continue
        c = {
            "id": uid(), "codigo": str(cod).strip(), "nombre": str(nombre).strip(),
            "cedula": texto_num(r[3]), "direccion": texto_num(r[4]), "telefono": texto_num(r[5]),
            "barrio": "", "notas": "", "creado": ymd(HOY),
        }
        clientes.append(c)
        por_codigo[c["codigo"]] = c
        por_nombre.setdefault(norm(c["nombre"]), c)

    def siguiente_codigo():
        mx = max((int("".join(ch for ch in c["codigo"] if ch.isdigit()) or 0) for c in clientes), default=0)
        return f"Cli_{mx + 1:03d}"

    def cliente_por_nombre(nombre):
        k = norm(nombre)
        if k in por_nombre:
            return por_nombre[k]
        parecido = difflib.get_close_matches(k, list(por_nombre), n=1, cutoff=0.82)
        if parecido:
            c = por_nombre[parecido[0]]
            reporte["avisos"].append(f'"{nombre}" (GANANCIAS) se asoció al cliente "{c["nombre"]}".')
            por_nombre[k] = c
            return c
        c = {"id": uid(), "codigo": siguiente_codigo(), "nombre": str(nombre).strip(), "cedula": "", "direccion": "",
             "telefono": "", "barrio": "", "notas": "Creado al importar el historial de GANANCIAS", "creado": ymd(HOY)}
        clientes.append(c)
        por_nombre[k] = c
        reporte["avisos"].append(f'"{nombre}" no estaba en CLIENTES: se creó como cliente nuevo ({c["codigo"]}).')
        return c

    # ---------------- Préstamos activos (RESUMEN + ESTADOS) ----------------
    estados = collections.defaultdict(list)
    for r in wb["ESTADOS"].iter_rows(min_row=5, values_only=True):
        if r[11] is not None:
            estados[r[11]].append(r)

    prestamos, activos_clave, ids_usados = [], set(), set()
    for r in wb["RESUMEN"].iter_rows(min_row=5, values_only=True):
        pid, cod = r[1], r[2]
        if pid is None:
            continue
        cod = str(cod).strip()
        cl = por_codigo.get(cod)
        if not cl:
            reporte["avisos"].append(f"Préstamo #{pid}: el código {cod} no está en CLIENTES; se creó un cliente sin datos.")
            cl = {"id": uid(), "codigo": cod, "nombre": f"Cliente {cod}", "cedula": "", "direccion": "", "telefono": "",
                  "barrio": "", "notas": "", "creado": ymd(HOY)}
            clientes.append(cl)
            por_codigo[cod] = cl
        fecha = as_date(r[4])
        capital = int(r[5] or 0)
        modalidad = str(r[6] or "Diario").strip()
        tasa = round(float(r[7] or 0) * 100, 4)
        filas = estados.get(pid, [])
        n = len(filas) or CUOTAS_DEFECTO.get(modalidad, 30)
        sin_pagar = [int(x[6]) for x in filas if x[7] is None and x[6]]
        todas = [int(x[6]) for x in filas if x[6]]
        base_cuota = sin_pagar or todas
        valor_cuota = collections.Counter(base_cuota).most_common(1)[0][0] if base_cuota else cuota_sugerida(capital, tasa, n)
        pagos = collections.defaultdict(int)
        for x in filas:
            fp = as_date(x[7])
            if fp and x[6]:
                pagos[fp] += int(x[6])
        movs = [{"id": uid(), "ts": ts + i, "tipo": "pago", "fecha": ymd(f), "valor": v, "nota": "Importado del Excel"}
                for i, (f, v) in enumerate(sorted(pagos.items()))]
        total = capital + interes(capital, tasa)
        saldo = total - sum(pagos.values())
        if r[10] is not None and round(float(r[10])) != saldo:
            reporte["avisos"].append(f"Préstamo #{pid}: la deuda del Excel ({r[10]:,.0f}) no coincide con la calculada ({saldo:,}).")
        if saldo <= 0:
            reporte["avisos"].append(f"Préstamo #{pid} ({cl['nombre']}) ya está pagado completo en ESTADOS.")
        prestamos.append({
            "id": int(pid), "clienteId": cl["id"], "fecha": ymd(fecha), "capital": capital, "tasa": tasa,
            "modalidad": modalidad, "nCuotas": n, "valorCuota": valor_cuota, "cobraDomingos": True,
            "estado": "activo", "notas": "Importado del Excel", "movs": movs, "creado": dt.datetime.now().isoformat(),
        })
        activos_clave.add((fecha, capital))
        ids_usados.add(int(pid))
        if fin_plazo(fecha, modalidad, n) < HOY and saldo > 0:
            reporte["avisos"].append(
                f"Préstamo #{pid} ({cl['nombre']}): el plazo venció el {fin_plazo(fecha, modalidad, n):%d/%m/%Y}. "
                "La app te avisará del interés adicional: revisa si ya lo cobraste para aplicarlo u omitirlo.")

    # ---------------- Historial (GANANCIAS con estado "Pagó") ----------------
    hist_mod = {}
    for r in wb["HISTORICOS PAGADOS"].iter_rows(min_row=5, values_only=True):
        if r[3] and as_date(r[4]):
            hist_mod[(norm(r[3]), as_date(r[4]), int(r[5] or 0))] = str(r[6] or "Diario").strip()

    g = wb["GANANCIAS"]
    historial = []
    pendientes_fuera = []
    for i in range(6, g.max_row + 1):
        estado, nombre, fecha, importe, inter = (g.cell(i, c).value for c in range(4, 9))
        if not nombre:
            continue
        fecha = as_date(fecha)
        st = norm(estado)
        if st.startswith("pend"):
            if (fecha, int(importe or 0)) not in activos_clave:
                pendientes_fuera.append(f"{nombre} · {fecha:%d/%m/%Y} · {int(importe or 0):,}")
            continue
        if not importe or not fecha:
            reporte["no_importado"].append(f"GANANCIAS fila {i}: {nombre} sin valor de préstamo o sin fecha (interés {inter}).")
            continue
        if (fecha, int(importe)) in activos_clave:
            continue  # ya está como préstamo activo
        historial.append((fecha, i, nombre, int(importe), float(inter or 0)))

    historial.sort()
    libres = (k for k in range(1, 100000) if k not in ids_usados)
    for fecha, fila, nombre, capital, inter in historial:
        cl = cliente_por_nombre(nombre)
        tasa = round(inter * 100 / capital, 4) if capital else 0
        modalidad = hist_mod.get((norm(nombre), fecha, capital), "Diario")
        n = CUOTAS_DEFECTO.get(modalidad, 30)
        total = capital + interes(capital, tasa)
        fpago = min(fin_plazo(fecha, modalidad, n), HOY)
        pid = next(libres)
        ids_usados.add(pid)
        prestamos.append({
            "id": pid, "clienteId": cl["id"], "fecha": ymd(fecha), "capital": capital, "tasa": tasa,
            "modalidad": modalidad, "nCuotas": n, "valorCuota": cuota_sugerida(capital, tasa, n), "cobraDomingos": True,
            "estado": "activo", "notas": f"Historial importado de GANANCIAS (fila {fila}).",
            "movs": [{"id": uid(), "ts": ts, "tipo": "pago", "fecha": ymd(fpago), "valor": total,
                      "nota": "Pagado (importado del Excel; fecha aproximada)"}],
            "creado": dt.datetime.now().isoformat(),
        })

    # ---------------- Socios ----------------
    socios = []
    primera = min((as_date(p["fecha"]) if False else dt.date.fromisoformat(p["fecha"]) for p in prestamos), default=HOY)
    for r in range(2, 5):
        nombre, valor, nota = g.cell(r, 2).value, g.cell(r, 3).value, g.cell(r, 4).value
        if nombre and valor:
            socios.append({
                "id": uid(), "nombre": str(nombre).strip(), "notas": f"Nota del Excel: {nota}" if nota else "",
                "movs": [{"id": uid(), "ts": ts, "tipo": "aporte", "fecha": ymd(primera), "valor": int(valor),
                          "nota": "Capital base (importado del Excel)"}],
            })
            if nota:
                reporte["avisos"].append(f'Socio {nombre}: el Excel tiene la nota "{nota}". Si fue un retiro, regístralo en Capital.')

    # ---------------- Adicionales (solo reporte) ----------------
    adicionales = []
    for r in range(6, 110):
        nom, monto, est = g.cell(r, 11).value, g.cell(r, 12).value, g.cell(r, 13).value
        if nom or monto:
            adicionales.append(f"{nom or '—'} · {monto if monto is not None else '—'} · {est or ''}".strip())
    if adicionales:
        reporte["no_importado"].append(
            f"ADICIONALES de GANANCIAS ({len(adicionales)} filas, suma {sum(int(g.cell(r, 12).value or 0) for r in range(6, 110)):,}): "
            "no tienen fecha ni préstamo, agrégalos como 'Interés adicional' en el préstamo que corresponda si quieres verlos en la app.")
        reporte["adicionales"] = adicionales
    if pendientes_fuera:
        reporte["no_importado"].append(
            f"{len(pendientes_fuera)} préstamos marcados 'Pendiente' en GANANCIAS no están en RESUMEN (probablemente renovaciones "
            "o registros viejos). No se importaron como activos: revísalos.")
        reporte["pendientes_fuera_de_resumen"] = pendientes_fuera

    activos = [p for p in prestamos if (p["notas"] or "").startswith("Importado")]
    reporte["resumen"] = {
        "clientes": len(clientes),
        "prestamos_activos": len(activos),
        "prestamos_historial": len(prestamos) - len(activos),
        "socios": len(socios),
        "pagos": sum(len(p["movs"]) for p in activos),
    }
    salida = {
        "app": "control-de-cobros", "tipo": "migracion-excel", "formato": 1,
        "generado": dt.datetime.now().isoformat(timespec="seconds"), "origen": XLSM.name,
        "datos": {"clientes": clientes, "prestamos": sorted(prestamos, key=lambda p: p["id"]), "socios": socios},
        "reporte": reporte,
    }
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"Archivo generado: {SALIDA}")
    for k, v in reporte["resumen"].items():
        print(f"  {k}: {v}")
    print(f"\nAvisos ({len(reporte['avisos'])}):")
    for a in reporte["avisos"]:
        print("  -", a)
    print(f"\nNo importado ({len(reporte['no_importado'])}):")
    for a in reporte["no_importado"]:
        print("  -", a)


if __name__ == "__main__":
    main()
