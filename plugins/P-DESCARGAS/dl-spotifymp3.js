
import axios from 'axios'
import config from '../../config.js'

// ═══════════════════════════════════════
// ✰ SAITAMABOT • JAKY SPOTIFY
// ═══════════════════════════════════════

const JAKY_API =
  'https://api.jaky.dev/v1/download/spotify'

const JAKY_KEY =
  'jK74D63CCF'

const BOT_NAME =
  config.botName ||
  '𝚂𝙰𝙸𝚃𝙰𝙼𝙰𝙱𝙾𝚃'

// ═══════════════════════════════════════
// ✰ LIMPIAR NOMBRE
// ═══════════════════════════════════════

function cleanFileName(name) {
  return String(name || 'Spotify Music')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150)
}

// ═══════════════════════════════════════
// ✰ VALIDAR SPOTIFY
// ═══════════════════════════════════════

function isSpotifyTrack(url) {
  return /^https?:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]+/i
    .test(String(url || '').trim())
}

// ═══════════════════════════════════════
// ✰ REACCIONES
// ═══════════════════════════════════════

async function react(conn, m, emoji) {
  return conn.sendMessage(
    m.chat,
    {
      react: {
        text: emoji,
        key: m.key
      }
    }
  ).catch(() => {})
}

// ═══════════════════════════════════════
// ✰ HANDLER
// ═══════════════════════════════════════

const handler = async (
  m,
  {
    conn,
    text,
    usedPrefix,
    command
  }
) => {
  try {
    const url = String(text || '').trim()

    if (!url) {
      await react(conn, m, '❌')

      return m.reply(
`༺ 𝚂𝙿𝙾𝚃𝙸𝙵𝚈 𝙼𝙿𝟹 ༻

✰ Envía el enlace de una canción de Spotify.

✰ Uso:
${usedPrefix}${command} <url>

✰ Ejemplo:
${usedPrefix}${command} https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT

✰ ${BOT_NAME}`
      )
    }

    if (!isSpotifyTrack(url)) {
      await react(conn, m, '❌')

      return m.reply(
`༺ 𝙴𝚁𝚁𝙾𝚁 𝚂𝙿𝙾𝚃𝙸𝙵𝚈 ༻

✰ URL inválida.
✰ Debes enviar un enlace de una canción de Spotify.

✰ ${BOT_NAME}`
      )
    }

    await react(conn, m, '🎵')

    // ═════════════════════════════════
    // ✰ CONSULTAR JAKY API
    // ═════════════════════════════════

    if (!JAKY_KEY || JAKY_KEY === 'TU_NUEVA_API_KEY') {
      throw new Error('Configura tu API Key de Jaky.')
    }

    const response = await axios.get(
      JAKY_API,
      {
        params: { url },
        headers: {
          'x-jaky-key': JAKY_KEY
        },
        timeout: 120000,
        validateStatus: status =>
          status >= 200 && status < 500
      }
    )

    const data = response?.data

    if (!data || data.status !== true) {
      throw new Error(
        data?.message ||
        data?.msg ||
        'Jaky API no pudo procesar la canción.'
      )
    }

    const song = data.result

    if (!song || !song.id) {
      throw new Error('Respuesta de Jaky incompleta.')
    }

    // ═════════════════════════════════
    // ✰ METADATOS
    // ═════════════════════════════════

    const title =
      song.name || 'Spotify Music'

    const artist =
      Array.isArray(song.artists)
        ? song.artists.join(', ')
        : String(song.artists || 'Desconocido')

    const album =
      song.album?.name || 'Desconocido'

    const duration =
      song.durationFormatted || 'Desconocida'

    const year =
      song.album?.year || 'Desconocido'

    const cover =
      song.coverUrl ||
      song.album?.coverUrl ||
      null

    const plays =
      song.playcountFormatted || 'Desconocidas'

    const fileName =
      `${cleanFileName(title)} - ${cleanFileName(artist)}.mp3`

    // ═════════════════════════════════
    // ✰ INFORMACIÓN DE LA CANCIÓN
    // ═════════════════════════════════

    const caption =
`༺ 𝚂𝙿𝙾𝚃𝙸𝙵𝚈 𝙸𝙽𝙵𝙾 ༻

✰ Título: ${title}
✰ Artista: ${artist}
✰ Álbum: ${album}
✰ Duración: ${duration}
✰ Año: ${year}
✰ Reproducciones: ${plays}

✰ Archivo: ${fileName}

✰ ${BOT_NAME}`

    if (cover) {
      const imageResponse = await axios.get(
        cover,
        {
          responseType: 'arraybuffer',
          timeout: 30000
        }
      )

      const imageBuffer = Buffer.from(
        imageResponse.data
      )

      if (imageBuffer.length) {
        await conn.sendMessage(
          m.chat,
          {
            image: imageBuffer,
            caption
          },
          { quoted: m }
        )
      } else {
        await m.reply(caption)
      }
    } else {
      await m.reply(caption)
    }

    await react(conn, m, '✅')

  } catch (error) {
    console.error(
      '[JAKY SPOTIFY]',
      error?.response?.data ||
      error?.message ||
      error
    )

    await react(conn, m, '❌')

    const details =
      error?.response?.data?.message ||
      error?.response?.data?.msg ||
      error?.message ||
      'Error desconocido.'

    return m.reply(
`༺ 𝙴𝚁𝚁𝙾𝚁 𝚂𝙿𝙾𝚃𝙸𝙵𝚈 ༻

✰ No se pudo consultar la canción.

✰ Detalles:
${String(details).slice(0, 350)}

✰ ${BOT_NAME}`
    )
  }
}

// ═══════════════════════════════════════
// ✰ CONFIGURACIÓN
// ═══════════════════════════════════════

handler.help = [
  'spotifymp3 <url>'
]

handler.tags = [
  'descargas'
]

handler.command = [
  'spotifymp3',
  'spmp3'
]

handler.register = false

export default handler

