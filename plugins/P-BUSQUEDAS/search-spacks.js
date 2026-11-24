import axios from 'axios'
import sharp from 'sharp'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✰ CONFIGURACIÓN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const API_URL = 'https://www.sylphyy.xyz/search/stickerly'
const API_KEY = process.env.SYLPH_API_KEY || 'sylph-d7ed7664'

const MAX_RESULTS = 7
const API_TIMEOUT = 30000
const IMAGE_TIMEOUT = 20000
const MAX_IMAGE_SIZE = 8 * 1024 * 1024

const HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  ...(API_KEY && API_KEY !== 'PON_AQUI_TU_API_KEY'
    ? { 'X-API-Key': API_KEY }
    : {})
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✰ REGISTRO DE ERRORES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function logError(stage, error) {
  console.error(
    `[SPACKSSEARCH][${stage}]`,
    error?.stack || error
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✰ REACCIONES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function react(conn, m, emoji) {
  try {
    await conn.sendMessage(m.chat, {
      react: {
        text: emoji,
        key: m.key
      }
    })
  } catch (error) {
    logError('REACTION', error)
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✰ NORMALIZAR RESULTADOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function normalizeSticker(item) {
  return {
    name: String(item.name || 'Paquete sin nombre'),
    author: String(item.author || 'No disponible'),
    stickerCount: Number(item.stickerCount || 0),
    views: Number(item.viewCount || 0),
    exports: Number(item.exportCount || 0),
    animated: Boolean(item.isAnimated),
    paid: Boolean(item.isPaid),
    image: item.thumbnailUrl || '',
    url: item.url || ''
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✰ VALIDAR URL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function isValidUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✰ BUSCAR STICKERLY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function searchStickerly(query) {
  console.log('[SPACKSSEARCH] Buscando:', query)

  const { data } = await axios.get(API_URL, {
    params: { q: query },
    headers: HEADERS,
    timeout: API_TIMEOUT
  })

  if (!data?.status || !Array.isArray(data.result)) {
    throw new Error('Respuesta inválida de Sticker.ly')
  }

  const results = data.result
    .map(normalizeSticker)
    .filter(item =>
      /^https:\/\/sticker\.ly\/s\/[a-zA-Z0-9]+/.test(item.url) &&
      isValidUrl(item.image)
    )
    .slice(0, MAX_RESULTS)

  console.log('[SPACKSSEARCH] Resultados válidos:', results.length)

  if (!results.length) {
    throw new Error('No se encontraron paquetes válidos')
  }

  return results
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✰ DESCARGAR Y CONVERTIR IMAGEN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function prepareImage(url) {
  if (!isValidUrl(url)) {
    throw new Error('URL de miniatura inválida')
  }

  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: IMAGE_TIMEOUT,
    maxContentLength: MAX_IMAGE_SIZE,
    maxBodyLength: MAX_IMAGE_SIZE,
    validateStatus: status => status === 200,
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  })

  const input = Buffer.from(response.data)

  if (!input.length || input.length > MAX_IMAGE_SIZE) {
    throw new Error('Miniatura vacía o demasiado grande')
  }

  const output = await sharp(input, {
    failOn: 'error',
    limitInputPixels: 40000000
  })
    .rotate()
    .resize({
      width: 900,
      height: 900,
      fit: 'inside',
      withoutEnlargement: true
    })
    .flatten({
      background: '#FFFFFF'
    })
    .jpeg({
      quality: 82,
      mozjpeg: true
    })
    .toBuffer()

  if (!Buffer.isBuffer(output) || !output.length) {
    throw new Error('Sharp no generó una imagen válida')
  }

  return output
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✰ FORMATEAR INFORMACIÓN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function formatSticker(sticker) {
  return [
    `∆ *${sticker.name}* ∆`,
    '',
    `✰ Autor: ${sticker.author}`,
    `✰ Stickers: ${sticker.stickerCount}`,
    `✰ Vistas: ${sticker.views.toLocaleString('es-PE')}`,
    `✰ Exportaciones: ${sticker.exports.toLocaleString('es-PE')}`,
    `✰ Animados: ${sticker.animated ? 'Sí' : 'No'}`,
    `✰ De pago: ${sticker.paid ? 'Sí' : 'No'}`
  ].join('\n')
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✰ PREPARAR TARJETAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function createCards(results) {
  const cards = []

  for (const sticker of results) {
    try {
      console.log(
        '[SPACKSSEARCH] Preparando imagen:',
        sticker.name
      )

      const imageBuffer = await prepareImage(sticker.image)

      const cardNumber = cards.length + 1

      cards.push({
        image: imageBuffer,
        mimetype: 'image/jpeg',

        title: `#${cardNumber}`,
        caption: formatSticker(sticker),
        footer: 'SaitamaBot',

        nativeFlow: [
          {
            text: 'DESCARGAR STICKERS',
            copy: `.spacksdl ${sticker.url}`
          }
        ]
      })

      console.log(
        `[SPACKSSEARCH] Tarjeta ${cardNumber} preparada correctamente`
      )

    } catch (error) {
      logError(`IMAGE ${sticker.name}`, error)
    }
  }

  console.log(
    '[SPACKSSEARCH] Total de tarjetas preparadas:',
    cards.length
  )

  if (!cards.length) {
    throw new Error('No se pudo preparar ninguna miniatura')
  }

  return cards
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✰ HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let handler = async (m, {
  conn,
  text,
  usedPrefix,
  command
}) => {

  if (!text?.trim()) {
    return conn.sendMessage(m.chat, {
      text: [
        '✰ *𝚂𝚃𝙸𝙲𝙺𝙴𝚁𝙻𝚈 𝚂𝙴𝙰𝚁𝙲𝙷*',
        '',
        '• Escribe el nombre del paquete.',
        `• Ejemplo: ${usedPrefix + command} Emma Myers`,
        '',
        'SaitamaBot'
      ].join('\n')
    }, {
      quoted: m
    })
  }

  const query = text.trim()

  await react(conn, m, '🔎')

  try {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━
    // ✰ BUSCAR RESULTADOS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━

    const results = await searchStickerly(query)

    // ━━━━━━━━━━━━━━━━━━━━━━━━━
    // ✰ PREPARAR TARJETAS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━

    const cards = await createCards(results)

    // ━━━━━━━━━━━━━━━━━━━━━━━━━
    // ✰ ENVIAR INFORMACIÓN
    // ━━━━━━━━━━━━━━━━━━━━━━━━━

    await conn.sendMessage(m.chat, {
      text: [
        '✰ *𝚂𝚃𝙸𝙲𝙺𝙴𝚁𝙻𝚈 𝚂𝙴𝙰𝚁𝙲𝙷*',
        '',
        `• Búsqueda: ${query}`,
        `• Resultados: ${cards.length}`,
        '• API: Sticker.ly',
        '',
        '༺═────── ✰ ──────═༻'
      ].join('\n')
    }, {
      quoted: m
    })

    console.log(
      '[SPACKSSEARCH] Enviando carrusel:',
      cards.length,
      'tarjetas'
    )

    // ━━━━━━━━━━━━━━━━━━━━━━━━━
    // ✰ ENVIAR CARRUSEL NATIVO
    // ━━━━━━━━━━━━━━━━━━━━━━━━━

    const sent = await conn.sendMessage(m.chat, {
      footer: 'SaitamaBot',
      cards
    }, {
      quoted: m
    })

    console.log(
      '[SPACKSSEARCH] Carrusel enviado. ID:',
      sent?.key?.id || 'No disponible'
    )

    await react(conn, m, '✅')

  } catch (error) {
    logError('HANDLER', error)

    await react(conn, m, '❌')

    try {
      await conn.sendMessage(m.chat, {
        text: [
          '༺ ✰ 𝙴𝚁𝚁𝙾𝚁 𝚂𝙿𝙰𝙲𝙺𝚂 ✰ ༻',
          '',
          '• No se pudo completar la búsqueda.',
          `• Error: ${error.message || 'Error desconocido'}`,
          '',
          'SaitamaBot'
        ].join('\n')
      }, {
        quoted: m
      })
    } catch (sendError) {
      logError('ERROR MESSAGE', sendError)
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✰ COMANDOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

handler.help = ['spacks <texto>']
handler.tags = ['busqueda']

handler.command = [
  'spacks',
  'spackssearch',
  'buscarstickers'
]

handler.register = false

export default handler
