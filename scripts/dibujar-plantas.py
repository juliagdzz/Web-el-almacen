# Uso: python3 scripts/dibujar-plantas.py .  (rehace monstera.svg, monstera-hoja.svg y alocasia.svg)
# Genera monstera.svg, monstera-hoja.svg y alocasia.svg en la paleta de El Almacén
import math, random, sys
OUT = sys.argv[1]
T, TC, TO, G, O, OO, C = "#A44E26", "#C86A3E", "#8F4220", "#551C25", "#9B9A3A", "#4A5A23", "#F3E9D8"
f = lambda v: f"{v:.1f}".rstrip("0").rstrip(".")

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

# ---------- Monstera variegada ----------
# Hojas con sus cortes (fenestraciones) y agujeros, hechos con una máscara para
# que se vea el fondo a través. Las manchas crema son la variegación: media luna
# en unas hojas, vetas y motitas en otras.
def hoja_monstera(n, x, y, ang, L, variegacion, semilla, agujeros=True, trazo=False):
    rnd = random.Random(semilla)
    w = L * .47
    forma = (f"M0 0C{f(w*.25)} {f(L*.1)} {f(w*.78)} {f(L*.13)} {f(w*.96)} {f(-L*.1)}"
             f"C{f(w*1.12)} {f(-L*.4)} {f(w*.8)} {f(-L*.84)} 0 {f(-L)}"
             f"C{f(-w*.8)} {f(-L*.84)} {f(-w*1.12)} {f(-L*.4)} {f(-w*.96)} {f(-L*.1)}"
             f"C{f(-w*.78)} {f(L*.13)} {f(-w*.25)} {f(L*.1)} 0 0Z")
    cortes = []
    tramos = (.2, .38, .56, .74)
    for t in tramos:
        for s in (1, -1):
            x0, y0 = s * w * rnd.uniform(.22, .4), -L * t
            x1, y1 = s * w * 1.5, -L * (t + .13)
            a0, a1 = L * .008, L * rnd.uniform(.03, .042)
            cortes.append(f'<path d="M{f(x0)} {f(y0-a0)}L{f(x1)} {f(y1-a1)}L{f(x1)} {f(y1+a1)}L{f(x0)} {f(y0+a0)}Z"/>')
            cortes.append(f'<circle cx="{f(x0)}" cy="{f(y0)}" r="{f(L*.012)}"/>')
            if agujeros and t < .7 and rnd.random() < .6:
                hx, hy = s * w * rnd.uniform(.4, .5), -L * (t + .1)
                cortes.append(f'<ellipse cx="{f(hx)}" cy="{f(hy)}" rx="{f(L*.028)}" ry="{f(L*.014)}" transform="rotate({f(s*-24)} {f(hx)} {f(hy)})"/>')
    caja = f'x="{f(-L*2)}" y="{f(-L*2)}" width="{f(L*4)}" height="{f(L*4)}"'
    mascara = (f'<mask id="m{n}" maskUnits="userSpaceOnUse" {caja}><path d="{forma}" fill="#fff"/>'
               f'<g fill="#000">{"".join(cortes)}</g></mask>')
    capas = []
    if trazo:  # versión de línea fina para detalles pequeños
        capas.append(f'<path d="{forma}" fill="{O}" fill-opacity=".25" stroke="{OO}" stroke-width="{f(L*.022)}"/>')
    else:
        capas.append(f'<path d="{forma}" fill="{OO}"/>')
    if variegacion == "media":  # media luna crema, con el borde ondulado junto al nervio
        capas.append(f'<path d="M{f(w*.03)} {f(L*.3)}C{f(w*.12)} {f(-L*.2)} {f(-w*.06)} {f(-L*.6)} {f(w*.05)} {f(-L*1.1)}H{f(w*1.6)}V{f(L*.3)}Z" fill="{C}"/>')
        capas.append(f'<path d="M{f(-w*.02)} 0C{f(-w*.18)} {f(-L*.3)} {f(-w*.1)} {f(-L*.55)} {f(-w*.22)} {f(-L*.72)}" stroke="{C}" stroke-width="{f(L*.035)}" fill="none" stroke-linecap="round" opacity=".9"/>')
    elif variegacion in ("vetas", "suave"):
        for t in tramos:
            for s in (1, -1):
                if rnd.random() < (.55 if variegacion == "vetas" else .25):
                    x0, y0 = s * w * .18, -L * (t + .07)
                    x1, y1 = s * w * 1.2, -L * (t + .18)
                    an = L * rnd.uniform(.02, .05)
                    capas.append(f'<path d="M{f(x0)} {f(y0)}Q{f((x0+x1)/2)} {f((y0+y1)/2-an)} {f(x1)} {f(y1)}Q{f((x0+x1)/2)} {f((y0+y1)/2+an)} {f(x0)} {f(y0)}Z" fill="{C}" opacity="{f(rnd.uniform(.75, .95))}"/>')
        for _ in range(26 if variegacion == "vetas" else 12):  # motitas, como la «Thai constellation»
            capas.append(f'<circle cx="{f(rnd.uniform(-w, w))}" cy="{f(-L*rnd.uniform(.05, .9))}" r="{f(L*rnd.uniform(.007, .018))}" fill="{C}" opacity=".9"/>')
    # nervio central y nervios de cada tramo
    venas = [f"M0 {f(L*.02)}Q{f(w*.04)} {f(-L*.5)} 0 {f(-L*.95)}"]
    for t in tramos:
        for s in (1, -1):
            venas.append(f"M{f(s*w*.06)} {f(-L*(t+.08))}Q{f(s*w*.5)} {f(-L*(t+.1))} {f(s*w*.92)} {f(-L*(t+.18))}")
    if not trazo:
        capas.append(f'<path d="{forma}" fill="none" stroke="{OO}" stroke-width="{f(L*.03)}"/>')
    capas.append(f'<path d="{" ".join(venas)}" fill="none" stroke="{O if not trazo else TC}" stroke-width="{f(L*(.012 if not trazo else .01))}" stroke-linecap="round" opacity=".8"/>')
    return (f'<g transform="translate({f(x)} {f(y)}) rotate({f(ang)})">{mascara}'
            f'<g mask="url(#m{n})">{"".join(capas)}</g></g>')

def hoja_nueva(x, y, ang, L):
    """La hoja que está saliendo, todavía enrollada."""
    return (f'<g transform="translate({f(x)} {f(y)}) rotate({f(ang)})">'
            f'<path d="M0 0C{f(L*.16)} {f(-L*.3)} {f(L*.1)} {f(-L*.75)} {f(L*.02)} {f(-L)}C{f(-L*.08)} {f(-L*.7)} {f(-L*.14)} {f(-L*.3)} 0 0Z" fill="{O}"/>'
            f'<path d="M{f(L*.01)} {f(-L*.08)}C{f(L*.09)} {f(-L*.35)} {f(L*.06)} {f(-L*.7)} {f(L*.02)} {f(-L*.95)}" stroke="{C}" stroke-width="{f(L*.05)}" fill="none" stroke-linecap="round" opacity=".85"/></g>')

cx, top = 120, 186
# tutor de fibra de coco detrás
tutor = (f'<rect x="{cx-6}" y="52" width="12" height="{top-48}" rx="5" fill="{TO}"/>'
         + "".join(f'<path d="M{cx-6} {yy}l12 -5" stroke="{G}" stroke-width="1.2" opacity=".45"/>' for yy in range(62, top, 9)))
# (dónde acaba el tallo, ángulo de la hoja, tamaño, variegación, agujeros): las
# hojas caen hacia fuera, como en la planta de verdad
HOJAS = [(64, 116, -72, 56, "vetas", True), (176, 104, 74, 54, "media", True), (96, 74, -36, 56, "suave", True),
         (146, 66, 30, 54, "vetas", True), (56, 164, -106, 44, "media", False), (186, 156, 108, 42, "suave", False)]
partes = [tutor]
for i, (bx, by, ang, L, var, ag) in enumerate(HOJAS):
    partes.append(tallo(cx + (bx - cx) * .1, top, bx, by, -(bx - cx) * .3, OO, 3))
    partes.append(hoja_monstera(i, bx, by, ang, L, var, 10 + i, ag))
partes.append(tallo(cx + 4, top, cx + 6, 62, 5, OO, 2.4))
partes.append(hoja_nueva(cx + 6, 64, 6, 40))
monstera = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 262">'
            f'<!-- Monstera variegada en una maceta del taller -->'
            + "".join(partes) + maceta(cx, top, 112, 80, 66, T, TO, esmalte=C) + "</svg>")
open(f"{OUT}/monstera.svg", "w").write(monstera)

# ---------- Hoja suelta de monstera (para detalles) ----------
hoja = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90">'
        f'<path d="M116 86C100 76 86 66 74 54" fill="none" stroke="{OO}" stroke-width="1.4" stroke-linecap="round"/>'
        + hoja_monstera("h", 74, 54, -52, 58, "media", 3, agujeros=True, trazo=True) + "</svg>")
open(f"{OUT}/monstera-hoja.svg", "w").write(hoja)

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
