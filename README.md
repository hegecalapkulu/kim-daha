# Kim Daha?

Arkadaşlarınla telefondan oynanan gizli oylama parti oyunu. Soru kartı açılır, herkes gizlice birini seçer, kartlar tek tek açılınca sonuç ortaya çıkar.

**Oyna:** https://hegecalapkulu.github.io/kim-daha/

## Nasıl oynanır
1. Biri **Oda aç** der, ekranda 4 harfli oda kodu ve QR çıkar.
2. Diğerleri linke girip kodu yazar (ya da QR okutur), lobide karakterini seçer.
3. Yönetici modu seçer: **Kendi kartlarımız** (herkes gizli bir soru yazar) ya da **Hazır deste** (9 paket, 418 soru, 19 kategori).
4. Yönetici kapalı karta dokununca tur başlar; herkes pembe isim kartlarından birini seçip masaya koyar.
5. Kartlar tek tek açılır. Oyların çoğunu alan kişiye kategorinin tepkisi çıkar, herkes aynı kişiyi seçerse bütün eller onu gösterir.

## Teknik
- Kurulum, hesap ya da sunucu yok: düz HTML/CSS/JS, GitHub Pages'te yayınlanır.
- Telefonlar ücretsiz, herkese açık bir MQTT sunucusu üzerinden konuşur (EMQX, yedek: Mosquitto). Odayı açan telefon oyunu yönetir.
- Oda kodunu bilen herkes oyunu görebilir; içine gerçekten özel bilgiler yazmayın.
- Sesler: [Kenney](https://kenney.nl) (CC0), `ses/` klasöründe.
- `tasarim/` klasörü tasarım sahnelerini içerir (sahte oyuncularla deneme sayfaları).
