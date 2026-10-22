# Uso: python3 scripts/dibujar-plantas.py .  (rehace maranta.svg, maranta-rama.svg y alocasia.svg)
# Genera maranta.svg, maranta-rama.svg y alocasia.svg en la paleta de El Almacén
import math, random, sys
OUT = sys.argv[1]
T, TC, TO, G, O, OO, C = "#A44E26", "#C86A3E", "#8F4220", "#551C25", "#9B9A3A", "#4A5A23", "#F3E9D8"
f = lambda v: f"{v:.1f}".rstrip("0").rstrip(".")

def hoja_maranta(x, y, ang, L, W, reves=False):
    """Hoja ovalada apuntando hacia arriba girada «ang» grados desde la vertical."""
    w = W / 2
    forma = f"M0 0C{f(w*1.25)} {f(-L*.18)} {f(w*1.1)} {f(-L*.8)} 0 {f(-L)}C{f(-w*1.1)} {f(-L*.8)} {f(-w*1.25)} {f(-L*.18)} 0 0Z"
    g = [f'<g transform="translate({f(x)} {f(y)}) rotate({f(ang)})">']
    if reves:  # el envés de la maranta es granate
        g.append(f'<path d="{forma}" fill="{G}"/>')
        g.append(f'<path d="M0 -2V{f(-L*.95)}" stroke="{TC}" stroke-width="1.2" opacity=".7"/>')
    else:
        g.append(f'<path d="{forma}" fill="{OO}"/>')
        # pluma clara en el centro
        pluma = f"M0 {f(-L*.06)}C{f(w*.55)} {f(-L*.25)} {f(w*.5)} {f(-L*.75)} 0 {f(-L*.94)}C{f(-w*.5)} {f(-L*.75)} {f(-w*.55)} {f(-L*.25)} 0 {f(-L*.06)}Z"
        g.append(f'<path d="{pluma}" fill="{O}"/>')
        # manchas oscuras a los lados del nervio
        for i, t in enumerate([.3, .52, .74]):
            lado = 1 if i % 2 == 0 else -1
            for s in (1, -1):
                g.append(f'<ellipse cx="{f(s*w*.62)}" cy="{f(-L*t)}" rx="{f(w*.26)}" ry="{f(L*.06)}" fill="#33401A" opacity=".75" transform="rotate({f(s*-25)} {f(s*w*.62)} {f(-L*t)})"/>')
        # nervios rojos en espiga
        venas = [f"M0 {f(-L*.04)}V{f(-L*.96)}"]
        for t in [.2, .36, .52, .68, .82]:
            ancho = math.sin(math.pi * min(.95, t + .05)) * w * .95
            venas.append(f"M0 {f(-L*t)}Q{f(ancho*.5)} {f(-L*(t+.04))} {f(ancho)} {f(-L*(t+.11))}")
            venas.append(f"M0 {f(-L*t)}Q{f(-ancho*.5)} {f(-L*(t+.04))} {f(-ancho)} {f(-L*(t+.11))}")
        g.append(f'<path d="{" ".join(venas)}" fill="none" stroke="{TC}" stroke-width="1" stroke-linecap="round" opacity=".9"/>')
    g.append("</g>")
    return "".join(g)

def tallo(x0, y0, x1, y1, curva=0, color=OO, grosor=2.2):
    mx, my = (x0 + x1) / 2 + curva, (y0 + y1) / 2
    return f'<path d="M{f(x0)} {f(y0)}Q{f(mx)} {f(my)} {f(x1)} {f(y1)}" fill="none" stroke="{color}" stroke-width="{grosor}" stroke-linecap="round"/>'

def maceta(cx, top, ancho_arriba, ancho_abajo, alto, cuerpo, borde, esmalte=None):
    a, b = ancho_arriba / 2, ancho_abajo / 2
    p = [f'<ellipse cx="{f(cx)}" cy="{f(top+alto+3)}" rx="{f(b*1.1)}" ry="4" fill="{G}" opacity=".18"/>',
         f'<path d="M{f(cx-a)} {f(top)}L{f(cx-b)} {f(top+alto)}Q{f(cx)} {f(top+alto+6)} {f(cx+b)} {f(top+alto)}L{f(cx+a)} {f(top)}Z" fill="{cuerpo}"/>']
    if esmalte:  # esmalte que chorrea desde el borde: es una maceta del taller
        gotas = [(0.08, 9), (0.22, 18), (0.37, 11), (0.52, 22), (0.68, 12), (0.83, 17), (0.94, 8)]
        e = f'<path d="M{f(cx-a)} {f(top)}H{f(cx+a)}V{f(top+7)}H{f(cx-a)}Z" fill="{esmalte}"/>'
        for t, largo in gotas:
            xx = cx - a + 2 * a * t
            e += f'<rect x="{f(xx-4.5)}" y="{f(top)}" width="9" height="{f(largo+4)}" rx="4.5" fill="{esmalte}"/>'
        p.append(e)
    p.append(f'<rect x="{f(cx-a-5)}" y="{f(top-10)}" width="{f(2*a+10)}" height="13" rx="3" fill="{borde}"/>')
    return "".join(p)

# ---------- Maranta frondosa ----------
random.seed(7)
cx, top = 120, 186
hojas = []
# capa de atrás: hojas altas; capa de delante: más bajas y colgando por el borde
config = []
for i, ang in enumerate(range(-66, 70, 15)):
    config.append((ang + random.uniform(-4, 4), random.uniform(80, 96), random.uniform(44, 50), i % 4 == 3))
for ang in (-112, -95, 95, 115, -128, 130):
    config.append((ang + random.uniform(-4, 4), random.uniform(62, 74), random.uniform(38, 42), abs(ang) > 120))
for ang in (-40, -8, 26, 52):
    config.append((ang, random.uniform(55, 66), random.uniform(38, 42), False))
partes = []
for ang, L, W, reves in config:
    r = math.radians(ang)
    largo_tallo = 26 if abs(ang) < 90 else 12
    bx, by = cx + math.sin(r) * largo_tallo + random.uniform(-6, 6), top - 6 - math.cos(r) * largo_tallo
    if abs(ang) > 90:
        bx, by = cx + math.copysign(48, ang), top - 4
    partes.append(tallo(cx + random.uniform(-14, 14), top, bx, by, random.uniform(-8, 8)))
    partes.append(hoja_maranta(bx, by, ang, L, W, reves))
lienzo = (0, 0, 240, 262)
maranta = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 262">'
           f'<!-- Maranta frondosa en una maceta del taller -->'
           + "".join(partes) + maceta(cx, top, 112, 80, 66, T, TO, esmalte=C) + "</svg>")
open(f"{OUT}/maranta.svg", "w").write(maranta)

# ---------- Ramita fina de maranta (para detalles) ----------
def hoja_fina(x, y, ang, L, W):
    w = W / 2
    forma = f"M0 0C{f(w*1.25)} {f(-L*.18)} {f(w*1.1)} {f(-L*.8)} 0 {f(-L)}C{f(-w*1.1)} {f(-L*.8)} {f(-w*1.25)} {f(-L*.18)} 0 0Z"
    venas = " ".join(f"M0 {f(-L*t)}l{f(w*.6)} {f(-L*.09)}M0 {f(-L*t)}l{f(-w*.6)} {f(-L*.09)}" for t in (.3, .5, .7))
    return (f'<g transform="translate({f(x)} {f(y)}) rotate({f(ang)})">'
            f'<path d="{forma}" fill="{O}" fill-opacity=".12" stroke="{OO}" stroke-width="1.1"/>'
            f'<path d="M0 0V{f(-L*.92)}{" " + venas}" fill="none" stroke="{TC}" stroke-width=".8" stroke-linecap="round"/></g>')
rama = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90">'
        f'<path d="M116 86C92 74 70 58 52 34" fill="none" stroke="{OO}" stroke-width="1.2" stroke-linecap="round"/>'
        + hoja_fina(52, 34, -38, 36, 17) + hoja_fina(70, 56, -78, 30, 14) + hoja_fina(90, 72, -10, 26, 12) + hoja_fina(66, 52, 18, 22, 10)
        + "</svg>")
open(f"{OUT}/maranta-rama.svg", "w").write(rama)

# ---------- Alocasia en tonos vino ----------
def hoja_alocasia(x, y, ang, L, W, color, vena):
    w = W / 2
    lado = lambda k: (f"C{f(k*w*.35)} {f(-L*.75)} {f(k*w*.98)} {f(-L*.38)} {f(k*w*.98)} {f(L*.04)}"
                      f"C{f(k*w*.98)} {f(L*.2)} {f(k*w*.82)} {f(L*.3)} {f(k*w*.6)} {f(L*.3)}"
                      f"C{f(k*w*.36)} {f(L*.3)} {f(k*w*.12)} {f(L*.12)} 0 0")
    der = lado(1)
    # el lado izquierdo, recorrido al revés para cerrar la hoja
    izq = (f"C{f(-w*.12)} {f(L*.12)} {f(-w*.36)} {f(L*.3)} {f(-w*.6)} {f(L*.3)}"
           f"C{f(-w*.82)} {f(L*.3)} {f(-w*.98)} {f(L*.2)} {f(-w*.98)} {f(L*.04)}"
           f"C{f(-w*.98)} {f(-L*.38)} {f(-w*.35)} {f(-L*.75)} 0 {f(-L)}Z")
    forma = f"M0 {f(-L)}{der}{izq}"
    venas = [f"M0 0V{f(-L*.95)}", f"M0 0Q{f(w*.35)} {f(L*.12)} {f(w*.6)} {f(L*.26)}", f"M0 0Q{f(-w*.35)} {f(L*.12)} {f(-w*.6)} {f(L*.26)}"]
    for t in (.15, .35, .55, .72):
        anchura = w * (1 - t) * .82
        venas.append(f"M0 {f(-L*t)}Q{f(anchura*.55)} {f(-L*(t+.02))} {f(anchura)} {f(-L*(t+.1))}")
        venas.append(f"M0 {f(-L*t)}Q{f(-anchura*.55)} {f(-L*(t+.02))} {f(-anchura)} {f(-L*(t+.1))}")
    return (f'<g transform="translate({f(x)} {f(y)}) rotate({f(ang)})"><path d="{forma}" fill="{color}"/>'
            f'<path d="{" ".join(venas)}" fill="none" stroke="{vena}" stroke-width="1.6" stroke-linecap="round" opacity=".85"/></g>')
cx, top = 110, 236
VINOS = [("#3E1219", "#C98F8A"), (G, "#E2B7AE"), ("#6E2A33", "#EBC9C0"), (G, "#D9A79F"), ("#7A3440", "#F0D5CC")]
hojas_al = [(-42, 112, 58, 64, 0), (36, 124, 62, 66, 1), (-6, 148, 66, 70, 2), (-66, 64, 50, 56, 3), (62, 72, 52, 58, 4)]
partes = []
for ang, alto_tallo, L, W, i in hojas_al:
    r = math.radians(ang * .55)
    x1, y1 = cx + math.sin(math.radians(ang)) * alto_tallo * .62, top - 8 - math.cos(math.radians(ang)) * alto_tallo
    partes.append(tallo(cx + (i - 2) * 4, top, x1, y1, -ang * .15, "#6E2A33", 3))
    color, vena = VINOS[i]
    partes.append(hoja_alocasia(x1, y1, ang, L, W, color, vena))
alocasia = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 310">'
            f'<!-- Alocasia en tonos vino -->' + "".join(partes) + maceta(cx, top, 96, 70, 64, "#D9C3B4", "#C9AE9C", esmalte=None)
            + f'<path d="M{cx-44} {top+24}H{cx+44}" stroke="{G}" stroke-width="5" opacity=".85"/>'
            + f'<path d="M{cx-41} {top+34}H{cx+41}" stroke="{T}" stroke-width="2.5" opacity=".8"/></svg>')
open(f"{OUT}/alocasia.svg", "w").write(alocasia)
print("ok")
