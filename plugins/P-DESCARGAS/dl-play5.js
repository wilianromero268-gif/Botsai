import axios from 'axios'
import config from '../../config.js'
import * as baileysMod from '@whiskeysockets/baileys'

// ═════════════════════════════════════
// ✰ SAITAMABOT • PLAY5
// ═════════════════════════════════════

const baileys =
  baileysMod.default && Object.keys(baileysMod).length === 1
    ? baileysMod.default
    : baileysMod

const {
  prepareWAMessageMedia,
  generateWAMessageFromContent
} = baileys

global.play5Cache = global.play5Cache || {}

const API_URL = 'https://api.jaky.dev/v1/download/play'

// Usa una API KEY nueva, porque la anterior quedó expuesta.
// También puedes configurar JAKY_API_KEY en tu entorno.
const API_KEY = process.env.JAKY_API_KEY || 'jK74D63CCF'

const FOOTER = config.botName || 'SaitamaBot'
const FRAME = '༺═────── ✰ ──────═༻'
const CACHE_TIME = 30 * 60 * 1000

const FORMATS = {
  mp4: {
    title: '🎬 MP4',
    description: 'Vídeo MP4',
    quality: '720p'
  },
  mp4doc: {
    title: '📁 MP4 DOC',
    description: 'Vídeo MP4 como documento',
    quality: '720p'
  },
  mp3: {
    title: '🎵 MP3',
    description: 'Audio MP3',
    quality: '128 kbps'
  },
  mp3doc: {
    title: '📁 MP3 DOC',
    description: 'Audio MP3 como documento',
    quality: '128 kbps'
  }
}

// ═════════════════════════════════════
// ✰ UTILIDADES
// ═════════════════════════════════════

function cleanText(value, fallback = 'N/A') {
  return String(value ?? fallback)
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 300)
}

function cacheKey(chat, sender) {
  return `${chat}:${sender}`
}

async function react(conn, m, emoji) {
  try {
    await conn.sendMessage(m.chat, {
      react: {
        text: emoji,
        key: m.key
      }
    })
  } catch (error) {
    console.error('[PLAY5] Reacción:', error.message)
  }
}

function getContextInfo(conn, m) {
  return {
    mentionedJid: [m.sender],
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid:
        global.newsletterJid ||
        '120363408885875268@newsletter',
      newsletterName:
        `${conn.botname || config.botName || 'SaitamaBot'} • ${config.ownerName || 'SAI'}`,
      serverMessageId: Math.floor(Math.random() * 999) + 1
    }
  }
}

// ═════════════════════════════════════
// ✰ API JAKY
// ═════════════════════════════════════

async function searchJaky(query) {
  if (
    !API_KEY ||
    API_KEY === 'PEGA_AQUI_TU_NUEVA_API_KEY'
  ) {
    throw new Error('Configura tu nueva API KEY de Jaky.')
  }

  const response = await axios.get(API_URL, {
    params: { query },
    headers: {
      'x-jaky-key': API_KEY,
      Accept: 'application/json'
    },
    timeout: 60000
  })

  if (
    response.data?.status !== true ||
    !response.data?.result
  ) {
    throw new Error('La API no devolvió resultados.')
  }

  const result = response.data.result

  if (!result.url) {
    throw new Error('La API no devolvió el enlace original.')
  }

  return result
}

// ═════════════════════════════════════
// ✰ CACHE
// ═════════════════════════════════════

function saveResult(chat, sender, result) {
  global.play5Cache[cacheKey(chat, sender)] = {
    result,
    createdAt: Date.now()
  }
}

function getResult(chat, sender) {
  const key = cacheKey(chat, sender)
  const session = global.play5Cache[key]

  if (!session?.result) return null

  if (Date.now() - session.createdAt > CACHE_TIME) {
    delete global.play5Cache[key]
    return null
  }

  return session.result
}

// ═════════════════════════════════════
// ✰ ENVÍO INTERACTIVO
// ═════════════════════════════════════

async function sendPlayCard(conn, m, result, userDb) {
  const title = cleanText(result.title, 'Sin título')
  const author = cleanText(result.author, 'Desconocido')
  const duration = cleanText(result.duration)
  const views = cleanText(result.views)

  const mp3Quality = result.mp3?.quality || 128
  const mp4Quality = result.mp4?.quality || 720

  const caption =
`༺ ✰ 𝚂𝙰𝙸𝚃𝙰𝙼𝙰𝙱𝙾𝚃 • 𝙿𝙻𝙰𝚈5 ✰ ༻

> ✰ 𝚃í𝚝𝚞𝚕𝚘: ${title}
> ✰ 𝙰𝚞𝚝𝚘𝚛: ${author}
> ✰ 𝙳𝚞𝚛𝚊𝚌𝚒ó𝚗: ${duration}
> ✰ 𝚅𝚒𝚜𝚝𝚊𝚜: ${views}

${FRAME}

> 🎬 𝙼𝙿4: ${mp4Quality}p
> 🎵 𝙼𝙿3: ${mp3Quality} kbps

Selecciona una opción para consultar el formato.

${FOOTER}`

  const rows = [
    {
      title: '🎬 MP4',
      description: `Vídeo • ${mp4Quality}p`,
      id: 'play5_mp4'
    },
    {
      title: '📁 MP4 DOC',
      description: 'Información del formato de vídeo',
      id: 'play5_mp4doc'
    },
    {
      title: '🎵 MP3',
      description: `Audio • ${mp3Quality} kbps`,
      id: 'play5_mp3'
    },
    {
      title: '📁 MP3 DOC',
      description: 'Información del formato de audio',
      id: 'play5_mp3doc'
    }
  ]

  // Si el usuario desactivó los botones,
  // enviar una alternativa de texto.
  if (conn.noButtons || userDb?.noButtons) {
    return conn.sendMessage(
      m.chat,
      {
        text:
          `${caption}\n\n` +
          `Opciones:\n` +
          `• .play5open mp4\n` +
          `• .play5open mp4doc\n` +
          `• .play5open mp3\n` +
          `• .play5open mp3doc\n\n` +
          `Enlace original:\n${result.url}`
      },
      { quoted: m }
    )
  }

  try {
    const thumbnail =
      result.thumbnailUrl ||
      'https://files.catbox.moe/dkxngv.png'

    const media = await prepareWAMessageMedia(
      { image: { url: thumbnail } },
      { upload: conn.waUploadToServer }
    )

    if (!media?.imageMessage) {
      throw new Error('No se pudo preparar la imagen del mensaje')
    }

    const header = {
      hasMediaAttachment: true,
      imageMessage: media.imageMessage
    }

    const buttons = [
      {
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
          title: '✰ SELECCIONAR FORMATO',
          sections: [
            {
              title: 'SAITAMABOT • PLAY5',
              rows
            }
          ]
        })
      }
    ]

    const msg = generateWAMessageFromContent(
      m.chat,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2
            },
            interactiveMessage: {
              body: { text: `${caption}\n\nContenido original:\n${result.url}` },
              footer: { text: FOOTER },
              header,
              nativeFlowMessage: { buttons },
              contextInfo: getContextInfo(conn, m)
            }
          }
        }
      },
      { quoted: m }
    )

    return await conn.relayMessage(
      m.chat,
      msg.message,
      {
        messageId: msg.key.id
      }
    )
  } catch (error) {
    console.error(
      '[PLAY5] Error interactivo:',
      error.stack || error.message
    )

    // Alternativa si falla el mensaje interactivo.
    return conn.sendMessage(
      m.chat,
      {
        text:
          `${caption}\n\n` +
          `Enlace original:\n${result.url}`
      },
      { quoted: m }
    )
  }
}

// ═════════════════════════════════════
// ✰ CONSULTAR FORMATO
// ═════════════════════════════════════

async function sendFormatInfo(conn, m, format) {
  const result = getResult(m.chat, m.sender)

  if (!result) {
    return m.reply(
      '✰ La búsqueda expiró. Realiza otra búsqueda con .play5.'
    )
  }

  const selected = FORMATS[format]

  if (!selected) {
    return m.reply('Formato no reconocido.')
  }

  const text =
`༺ ✰ 𝙿𝙻𝙰𝚈5 • 𝙵𝙾𝚁𝙼𝙰𝚃𝙾 ✰ ༻

> ✰ Título: ${cleanText(result.title)}
> ✰ Formato: ${selected.title}
> ✰ Tipo: ${selected.description}
> ✰ Calidad: ${selected.quality}

${FRAME}

El enlace original está disponible aquí:
${result.url}

${FOOTER}`

  await react(conn, m, '✅')

  return conn.sendMessage(
    m.chat,
    {
      text,
      contextInfo: {
        externalAdReply: {
          title: cleanText(result.title),
          body: selected.description,
          thumbnailUrl: result.thumbnailUrl || '',
          sourceUrl: result.url,
          mediaType: 1,
          renderLargerThumbnail: true
        }
      }
    },
    { quoted: m }
  )
}

// ═════════════════════════════════════
// ✰ HANDLER PRINCIPAL
// ═════════════════════════════════════

const handler = async (
  m,
  { conn, text, command, userDb }
) => {
  try {
    const cmd = String(command || '').toLowerCase()
    const query = String(text || '').trim()

    if (cmd === 'play5open') {
      const format = query.toLowerCase()
      return sendFormatInfo(conn, m, format)
    }

    if (!query) {
      return m.reply(
        `✰ Escribe el nombre de una canción o vídeo.\n\n` +
        `Ejemplo:\n.play5 Korn - Y'all Want A Single`
      )
    }

    await react(conn, m, '🔎')

    const result = await searchJaky(query)

    saveResult(m.chat, m.sender, result)

    const sent = await sendPlayCard(conn, m, result, userDb)

    if (!sent) {
      throw new Error('No se pudo enviar la tarjeta.')
    }

    await react(conn, m, '✅')

    console.log(
      '[PLAY5] Resultado enviado:',
      cleanText(result.title)
    )

    return sent
  } catch (error) {
    console.error(
      '[PLAY5] ERROR:',
      error.stack || error.message
    )

    await react(conn, m, '❌')

    return m.reply(
      `✰ Error en PLAY5:\n${cleanText(error.message, 'Error desconocido')}`
    )
  }
}

// ═════════════════════════════════════
// ✰ RESPUESTAS DEL MENÚ INTERACTIVO
// ═════════════════════════════════════

handler.all = async (m, { conn }) => {
  const responseId = String(m.responseId || '')

  if (!responseId.startsWith('play5_')) {
    return false
  }

  const format = responseId.slice('play5_'.length)

  if (!FORMATS[format]) {
    return false
  }

  try {
    await sendFormatInfo(conn, m, format)
    return true
  } catch (error) {
    console.error(
      '[PLAY5] Error seleccionando formato:',
      error.stack || error.message
    )

    return m.reply('No se pudo consultar ese formato.')
  }
}

// ═════════════════════════════════════
// ✰ CONFIGURACIÓN
// ═════════════════════════════════════

handler.help = [
  'play5 <búsqueda>',
  'play6 <búsqueda>',
  'play7 <búsqueda>',
  'ytplay5 <búsqueda>',
  'ytplay6 <búsqueda>',
  'playyt <búsqueda>',
  'buscarplay <búsqueda>',
  'musicplay <búsqueda>'
]

handler.tags = ['descargas']

handler.command =
  /^(play5|play6|play7|ytplay5|ytplay6|playyt|buscarplay|musicplay|play5open)$/i

export default handler
