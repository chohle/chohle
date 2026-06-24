import { describe, it, expect } from 'vitest'
import { htmlToText } from '../server/utils/emailTemplate'

describe('htmlToText', () => {
  it('strips tags and decodes the common entities', () => {
    expect(htmlToText('<p>Hello <b>world</b></p>')).toBe('Hello world')
    expect(htmlToText('a &amp; b')).toBe('a & b')
    expect(htmlToText('1 &lt; 2 &gt; 0')).toBe('1 < 2 > 0')
    expect(htmlToText('say &quot;hi&quot;')).toBe('say "hi"')
  })

  it('converts block tags and <br> to newlines', () => {
    expect(htmlToText('<p>one</p><p>two</p>')).toBe('one\ntwo')
    expect(htmlToText('a<br>b')).toBe('a\nb')
  })

  // Regression for CodeQL js/double-escaping: &amp; must be decoded LAST, so an
  // already-escaped entity is not unescaped twice.
  it('decodes &amp; last so escaped entities are not double-unescaped', () => {
    // "&amp;lt;" is the escaped form of the literal text "&lt;". It must decode
    // to "&lt;", NOT to "<".
    expect(htmlToText('&amp;lt;')).toBe('&lt;')
    expect(htmlToText('a &amp;gt; b')).toBe('a &gt; b')
    expect(htmlToText('&amp;amp;')).toBe('&amp;')
  })
})
