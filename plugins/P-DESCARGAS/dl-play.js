import axios from 'axios'
import ytsearch from 'yt-search'
import config from '../../config.js'
import {
  generateWAMessageFromContent,
  prepareWAMessageMedia
} from '@whiskeysockets/baileys'

// ═══════════════════════════════════════
// ✰ SAITAMABOT • YOUTUBE PLAY
// ═══════════════════════════════════════

global.youtubeCache = global.youtubeCache || {}

const LUXINFINITY = 'https://luxinfinity.vercel.app/api/search/youtube'
const BOT_NAME = config.botName || '𝑺𝒂𝒊𝒕𝒂𝒎𝒂𝑩𝒐𝒕'
const FRAME = '*༺═────── ✰ ──────═༻*'

const clean = (value, fallback = 'Desconocido') => {
  if (value === null || value === undefined || value === '') return fallback
  return String(value).replace(/[\u0000-\u001F]/g, ' ').trim() || fallback
}

const getThumbnail = video =>
  video.thumbnail ||
  `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`

// ═══════════════════════════════════════
// ✰ HANDLER PRINCIPAL
// ═══════════════════════════════════════

const handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    if (command === 'playnext') {
      const saved = global.youtubeCache[m.sender]

      if (!saved?.results?.length) {
        return m.reply(
`${FRAME}
*༺ 𝚂𝙸𝙽 𝙱Ú𝚂𝚀𝚄𝙴𝙳𝙰 ༻*

✰ No hay resultados guardados.
✰ Usa: ${usedPrefix}play <texto>

${BOT_NAME}`
        )
      }

      saved.index = (saved.index + 1) % saved.results.length

      return sendYoutubeCard(
        conn,
        m,
        saved.results,
        saved.index
      )
    }

    if (!text?.trim()) {
      return m.reply(
`${FRAME}
*༺ 𝚈𝙾𝚄𝚃𝚄𝙱𝙴 𝙿𝙻𝙰𝚈 ༻*

✰ Uso: ${usedPrefix}${command} <texto>
✰ Ejemplo: ${usedPrefix}play Twice

${BOT_NAME}`
      )
    }

    const query = text.trim()

    await conn.sendMessage(m.chat, {
      react: { text: '⏳', key: m.key }
    }).catch(() => {})

    const searchMsg = await m.reply(
`${FRAME}
*༺ 𝙱𝚄𝚂𝙲𝙰𝙽𝙳𝙾 𝙴𝙽 𝚈𝙾𝚄𝚃𝚄𝙱𝙴 ༻*

✰ Consulta: ${query}

${BOT_NAME}`
    )

    let videos = []

    // ───────── YT-SEARCH ─────────

    try {
      const result = await ytsearch(query)

      if (Array.isArray(result?.videos)) {
        videos = result.videos.slice(0, 10).map(v => ({
          title: clean(v.title, 'Sin título'),
          author: clean(v.author?.name),
          duration: clean(v.timestamp),
          views: Number(v.views || 0).toLocaleString(),
          publishedAt: clean(v.ago),
          videoId: v.videoId,
          thumbnail: v.image,
          url: v.url
        })).filter(v => v.videoId && v.url)
      }
    } catch (error) {
      console.error('[PLAY] YT-SEARCH:', error.message)
    }

    // ───────── API SECUNDARIA ─────────

    if (!videos.length) {
      try {
        const { data } = await axios.get(LUXINFINITY, {
          params: { query, limit: 10 },
          timeout: 30000
        })

        const list = Array.isArray(data?.data) ? data.data : []

        videos = list.slice(0, 10).map(v => ({
          title: clean(v.title, 'Sin título'),
          author: clean(v.author?.name || v.author),
          duration: clean(
            v.duration?.text || v.duration?.timestamp || v.duration
          ),
          views: Number(v.views || 0).toLocaleString(),
          publishedAt: clean(v.publishDate),
          videoId: v.id || v.videoId,
          thumbnail: v.thumb || v.thumbnail || v.image,
          url: v.url
        })).filter(v => v.videoId && v.url)
      } catch (error) {
        console.error('[PLAY] LUXINFINITY:', error.message)
      }
    }

    // ───────── VALIDAR RESULTADOS ─────────

    if (!videos.length) {
      await conn.sendMessage(m.chat, {
        text:
`${FRAME}
*༺ 𝚂𝙸𝙽 𝚁𝙴𝚂𝚄𝙻𝚃𝙰𝙳𝙾𝚂 ༻*

✰ No encontré: ${query}

${BOT_NAME}`,
        edit: searchMsg.key
      }).catch(async () => {
        await m.reply(`✰ No encontré resultados para: ${query}`)
      })

      await conn.sendMessage(m.chat, {
        react: { text: '❌', key: m.key }
      }).catch(() => {})

      return
    }

    global.youtubeCache[m.sender] = {
      query,
      index: 0,
      results: videos
    }

    await conn.sendMessage(m.chat, {
      text:
`${FRAME}
*༺ 𝚁𝙴𝚂𝚄𝙻𝚃𝙰𝙳𝙾𝚂 𝙴𝙽𝙲𝙾𝙽𝚃𝚁𝙰𝙳𝙾𝚂 ༻*

✰ Resultados: ${videos.length}
✰ Preparando tarjeta interactiva...

${BOT_NAME}`,
      edit: searchMsg.key
    }).catch(() => {})

    await sendYoutubeCard(conn, m, videos, 0)

    await conn.sendMessage(m.chat, {
      react: { text: '✅', key: m.key }
    }).catch(() => {})

  } catch (error) {
    console.error('[PLAY] ERROR:', error)

    await conn.sendMessage(m.chat, {
      react: { text: '❌', key: m.key }
    }).catch(() => {})

    return m.reply(
`${FRAME}
*༺ 𝙴𝚁𝚁𝙾𝚁 𝙿𝙻𝙰𝚈 ༻*

✰ No se pudo completar la búsqueda.
✰ Error: ${clean(error.message)}

${BOT_NAME}`
    )
  }
}

// ═══════════════════════════════════════
// ✰ TARJETA INTERACTIVA
// ═══════════════════════════════════════

async function sendYoutubeCard(conn, m, results, index) {
  const video = results[index]

  if (!video) {
    return m.reply('✰ No existe ese resultado.')
  }

  const infoText =
`${FRAME}
*༺ 𝚂𝙰𝙸𝚃𝙰𝙼𝙰𝙱𝙾𝚃 • 𝚈𝙾𝚄𝚃𝚄𝙱𝙴 ༻*

✰ *Título:* ${clean(video.title)}
✰ *Canal:* ${clean(video.author)}
✰ *Duración:* ${clean(video.duration)}
✰ *Vistas:* ${clean(video.views)}
✰ *Publicado:* ${clean(video.publishedAt)}

✰ *Resultado:* ${index + 1}/${results.length}

${FRAME}
✰ Selecciona una opción en el botón inferior.

${BOT_NAME}`

  const selector = {
    title: '✰ OPCIONES DE YOUTUBE',
    sections: [
      {
        title: '✰ NAVEGACIÓN',
        rows: [
          {
            title: 'Siguiente resultado',
            description: `Ver resultado ${index + 2 > results.length ? 1 : index + 2}/${results.length}`,
            id: 'playnext'
          },
          {
            title: 'Abrir en YouTube',
            description: 'Ver el contenido original',
            id: `playurl ${video.videoId}`
          }
        ]
      }
    ]
  }

  const buttons = [{
    name: 'single_select',
    buttonParamsJson: JSON.stringify(selector)
  }]

  let header = {
    title: '✰ SAITAMABOT • YOUTUBE',
    hasMediaAttachment: false
  }

  try {
    const media = await prepareWAMessageMedia(
      { image: { url: getThumbnail(video) } },
      { upload: conn.waUploadToServer }
    )

    if (media?.imageMessage) {
      header = {
        hasMediaAttachment: true,
        imageMessage: media.imageMessage
      }
    }
  } catch (error) {
    console.error('[PLAY] MINIATURA:', error.message)
  }

  const message = generateWAMessageFromContent(
    m.chat,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2
          },
          interactiveMessage: {
            body: { text: infoText },
            footer: { text: BOT_NAME },
            header,
            nativeFlowMessage: { buttons }
          }
        }
      }
    },
    { quoted: m }
  )

  return conn.relayMessage(
    m.chat,
    message.message,
    { messageId: message.key.id }
  )
}

// ═══════════════════════════════════════
// ✰ RESPUESTAS DE BOTONES
// ═══════════════════════════════════════

handler.all = async function (m, { conn }) {
  const responseId = String(m.responseId || '').trim()

  if (!responseId.startsWith('playurl ')) return false

  const videoId = responseId.slice('playurl '.length).trim()

  if (!/^[\w-]{11}$/.test(videoId)) return false

  await conn.sendMessage(m.chat, {
    text:
`${FRAME}
*༺ 𝚈𝙾𝚄𝚃𝚄𝙱𝙴 • 𝙲𝙾𝙽𝚃𝙴𝙽𝙸𝙳𝙾 𝙾𝚁𝙸𝙶𝙸𝙽𝙰𝙻 ༻*

https://www.youtube.com/watch?v=${videoId}

${BOT_NAME}`,
    quoted: m
  })

  return true
}

// ═══════════════════════════════════════
// ✰ CONFIGURACIÓN
// ═══════════════════════════════════════

handler.help = [
  'play <texto>',
  'playnext'
]

handler.tags = ['descargas']

handler.command = [
  'play',
  'play2',
  'play3',
  'playnext'
]

handler.register = false

export default handler
