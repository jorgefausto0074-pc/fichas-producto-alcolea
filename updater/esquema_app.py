"""Etiquetas en español de los campos de la ficha (solo rótulos de la maqueta; sin valores de producto)."""

CAB = [  # clave, etiqueta ES (para la app), significado
 ("codigo_sap", "Código SAP", ""),
 ("n_pagina_ficha", "Nº página", ""),
 ("fecha", "Fecha", ""),
 ("edicion", "Edición", ""),
 ("producto", "Producto", ""),
 ("marca", "Marca", ""),
 ("formato", "Formato", ""),
 ("consumo_preferente", "Consumo preferente", ""),
 ("sap_mezcla", "SAP Mezcla (código G)", ""),
 ("sap_mezcla_casilla_2", "SAP Mezcla (2ª casilla)", ""),
 ("relacion_jarabe", "Relación jarabe", ""),
 ("codificacion_envase", "Codificación envase", ""),
 ("aseptico", "Aséptico", ""),
 ("marcado_e", "Marcado E", ""),
 ("n_producto_ean128", "Nº producto para EAN 128", ""),
]
ENV = [
 ("peso_preforma_g", "Peso preforma (g)", ""), ("color_preforma", "Color preforma", ""), ("envase", "Envase", ""),
 ("tipo_tapon", "Tipo tapón", ""), ("asa", "Asa", ""), ("pajita", "Pajita", ""), ("posicion_pajita", "Posición pajita", ""),
 ("bandeja", "Bandeja", ""), ("codifica_bandeja", "Codifica bandeja", ""), ("plastico_estirable", "Plástico estirable", ""),
 ("retractilado_bandeja", "Retractilado bandeja", ""),
]
PAL = [
 ("tipo_palet", "Tipo palet", ""), ("agrupacion", "Agrupación", ""), ("n_capas", "Nº capas", ""),
 ("cajas_palet", "Cajas/palet", ""), ("uds_caja", "Uds/caja", ""), ("uds_palet", "Uds/palet", ""),
]
DIS = {
 "etiqueta_ean": "Diseño etiqueta/lata · EAN", "botella_tipo": "Diseño botella · Tipo", "etiqueta_version": "Diseño etiqueta · Versión",
 "etiqueta_version_casilla_2": "Diseño etiqueta · Versión (2ª casilla)", "tapon_sap": "Diseño tapón/tapa · SAP", "tapon_sap_casilla_2": "Diseño tapón/tapa · SAP (2ª casilla)",
 "cluster_ean": "Diseño cluster · EAN", "cluster_version": "Diseño cluster · Versión", "asa_n": "Diseño asa · N. ASA", "separador": "Separador",
 "retrac_ean": "Retrác./Et. paquete · EAN", "et_caja_ean": "Et. caja · EAN", "et_palet_ean": "Et. palet · EAN", "retrac_version": "Retrác./Et. paquete · Versión",
 "retrac_version_casilla_2": "Retrác./Et. paquete · Versión (2ª casilla)", "et_caja_version": "Et. caja · Versión", "et_palet_version": "Et. palet · Versión",
 "bandeja_ean": "Diseño bandeja · EAN", "mosaico": "Mosaico (texto; siempre null, el mosaico es imagen)", "bandeja_version": "Diseño bandeja · Versión",
 "bandeja_version_casilla_2": "Diseño bandeja · Versión (2ª casilla)", "validado_ficha_cliente": "Validado con ficha cliente", "creado_por": "Creado por", "validado_por": "Validado por",
}
IMG = {"botella": "Diseño botella", "etiqueta": "Diseño etiqueta/lata", "tapon": "Diseño tapón/tapa", "retractil_et_paquete": "Retráctil / Et. paquete",
       "etiqueta_caja": "Etiqueta caja", "etiqueta_palet": "Etiqueta palet", "asa": "Diseño asa", "bandeja": "Diseño bandeja", "mosaico": "Mosaico de paletización"}
