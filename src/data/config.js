export const CONFIG = {
  appName: "Música Premium Barato",
  tagline: "Disfruta de la mejor calidad de sonido sin pagar de más",
  description: "Cuentas premium de Tidal, Deezer y Qobuz al mejor precio del mercado. Soporte garantizado y activación inmediata.",
  whatsappNumber: "51923282640", // Reemplaza con tu número de WhatsApp real (código de país + número, ej: 51999999999)
  whatsappChannelUrl: "https://whatsapp.com/channel/0029VaqrOWcEKyZHhnDyhY14", // Reemplaza con el enlace de tu canal de WhatsApp
  socials: {
    facebook: "https://www.facebook.com/recursosdigitalespremium1", // Reemplaza con tu página de Facebook
    instagram: "https://instagram.com/musicapremiumbarato", // Reemplaza con tu Instagram
    tiktok: "https://tiktok.com/@musicapremiumbarato" // Reemplaza con tu TikTok
  },
  payments: {
    yape: {
      name: "Jorge Pal**", // Reemplaza con tu nombre titular de Yape
      number: "923 282 640", // Reemplaza con tu número de Yape
      qrImage: "/images/yape-qr.png" // Ruta de tu código QR de Yape (colócalo en /public/images/)
    },
    plin: {
      name: "Jorge Pal**", // Reemplaza con tu nombre titular de Plin
      number: "923 282 640", // Reemplaza con tu número de Plin
      qrImage: "/images/plin-qr.png" // Ruta de tu código QR de Plin (colócalo en /public/images/)
    },
    binancePay: {
      payId: "99190804", // Reemplaza con tu Binance Pay ID
      usdtAddress: "TY3m4... (Red TRC20)", // Opcional: Tu dirección de depósito USDT
      qrImage: "/images/binance-qr.png" // Opcional: QR de Binance Pay (colócalo en /public/images/)
    }
  },
  services: {
    tidal: {
      id: "tidal",
      name: "Tidal",
      tagline: "Sonido de Alta Fidelidad sin pérdidas",
      description: "Ideal para audiófilos que buscan calidad de sonido Master (MQA) y Dolby Atmos. Transmite música en formato FLAC de alta resolución.",
      accentColor: "#00e5ff", // Cyan
      bgGradient: "linear-gradient(135deg, rgba(0, 229, 255, 0.1) 0%, rgba(0, 0, 0, 0.4) 100%)",
      features: [
        "Calidad de audio hasta 24-bit, 192 kHz (FLAC)",
        "Más de 100 millones de canciones sin anuncios",
        "Escucha sin conexión (descargas)",
        "Soporte para Dolby Atmos y Sony 360 Reality Audio",
        "Garantía completa durante todo el periodo adquirido"
      ],
      plans: [
        { id: "tidal-1m", duration: "1 Mes", pricePen: "S/. 4.00", priceUsd: "2.50", popular: false },
        { id: "tidal-3m", duration: "6 Meses", pricePen: "S/. 15.00", priceUsd: "6.50", popular: true },
        { id: "tidal-6m", duration: "12 Meses", pricePen: "S/. 25.00", priceUsd: "11.50", popular: false }
      ]
    },
    deezer: {
      id: "deezer",
      name: "Deezer",
      tagline: "El catálogo más grande con Flow personalizado",
      description: "Disfruta de sonido de alta fidelidad (HiFi), letras integradas, traducciones de canciones y la mejor recomendación personalizada con Flow.",
      accentColor: "#ff007f", // Magenta
      bgGradient: "linear-gradient(135deg, rgba(255, 0, 127, 0.1) 0%, rgba(0, 0, 0, 0.4) 100%)",
      features: [
        "Calidad High Fidelity (HiFi FLAC 16-bit)",
        "Flow: tu banda sonora personalizada e infinita",
        "Letras con traducción en tiempo real",
        "Identificador de canciones (SongCatcher) integrado",
        "Garantía completa durante todo el periodo adquirido"
      ],
      plans: [
        { id: "deezer-1m", duration: "1 Mes", pricePen: "S/. 6.00", priceUsd: "2.70", popular: false },
        { id: "deezer-3m", duration: "2 Meses", pricePen: "S/. 9.00", priceUsd: "7.00", popular: true },
        { id: "deezer-6m", duration: "12 Meses", pricePen: "S/. 45.00", priceUsd: "13.00", popular: false }
      ]
    },
    qobuz: {
      id: "qobuz",
      name: "Qobuz",
      tagline: "La calidad suprema para verdaderos melómanos",
      description: "La plataforma de streaming definitiva para la reproducción con calidad de estudio de grabación. Folletos digitales de álbumes y artículos de expertos.",
      accentColor: "#d4af37", // Dorado
      bgGradient: "linear-gradient(135deg, rgba(212, 175, 55, 0.1) 0%, rgba(0, 0, 0, 0.4) 100%)",
      features: [
        "Calidad Hi-Res real (hasta 24-bit / 192 kHz FLAC)",
        "Acceso a folletos digitales completos en PDF",
        "Artículos editoriales, reseñas e información detallada",
        "Ideal para sistemas de audio de alta gama y DACs",
        "Garantía completa durante todo el periodo adquirido"
      ],
      plans: [
        { id: "qobuz-1m", duration: "1 Mes", pricePen: "S/. 12.00", priceUsd: "3.50", popular: false },
        { id: "qobuz-3m", duration: "3 Meses", pricePen: "S/. 32.00", priceUsd: "9.00", popular: true },
        { id: "qobuz-6m", duration: "6 Meses", pricePen: "S/. 60.00", priceUsd: "17.00", popular: false }
      ]
    }
  },
  testimonials: [
    {
      id: 1,
      name: "Carlos Mendoza",
      service: "Tidal",
      rating: 5,
      comment: "Llevo 6 meses comprando Tidal aquí y el servicio es impecable. El audio FLAC es otro nivel y las cuentas nunca se caen.",
      date: "Hace 2 semanas",
      image: "/images/testimonio-1.png" // Placeholder o captura real
    },
    {
      id: 2,
      name: "Andrea Rivas",
      service: "Qobuz",
      rating: 5,
      comment: "Excelente atención por WhatsApp, la activación de Qobuz fue en menos de 10 minutos. Lo recomiendo al 100%.",
      date: "Hace 1 mes",
      image: "/images/testimonio-2.png"
    },
    {
      id: 3,
      name: "Gabriel Castillo",
      service: "Deezer",
      rating: 5,
      comment: "Precios bajísimos y la calidad es la misma que pagar la suscripción oficial completa. El vendedor es muy amable y confiable.",
      date: "Hace 3 días",
      image: "/images/testimonio-3.png"
    }
  ]
};
