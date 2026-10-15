export interface DeliveryQuote {
  distanceKm: number;
  deliveryFee: number;
  deliveryFeeFormatted: string;
  estimatedTime: string;
  withinRange: boolean;
  notes?: string;
}

export interface GeocodedLocation extends DeliveryQuote {
  latitude: number;
  longitude: number;
  address: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  mapUrl: string;
}

export class GeocodingService {
  // Base da Pizzaria (Av. Paulista, 1000 - Bela Vista, São Paulo - SP)
  public readonly baseLocation = {
    name: 'Forno & Sabor Pizzaria Artesanal',
    address: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP, 01310-100',
    lat: -23.5648865,
    lng: -46.6519180
  };

  /**
   * Calcula a distância em quilômetros entre dois pontos usando a fórmula de Haversine
   */
  public calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Raio da Terra em km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    return Math.round(d * 10) / 10; // 1 casa decimal (ex: 4.2 km)
  }

  /**
   * Calcula o frete e prazo com base na distância
   */
  public getDeliveryQuote(distanceKm: number): DeliveryQuote {
    if (distanceKm <= 3.0) {
      return {
        distanceKm,
        deliveryFee: 0,
        deliveryFeeFormatted: 'GRÁTIS (Cortesia do Luigi! 🎉)',
        estimatedTime: '25 a 35 minutos',
        withinRange: true,
        notes: 'Raio express de entrega prioritária.'
      };
    } else if (distanceKm <= 6.0) {
      return {
        distanceKm,
        deliveryFee: 7.0,
        deliveryFeeFormatted: 'R$ 7,00',
        estimatedTime: '35 a 45 minutos',
        withinRange: true,
        notes: 'Taxa fixa reduzida para bairros vizinhos.'
      };
    } else if (distanceKm <= 10.0) {
      return {
        distanceKm,
        deliveryFee: 12.0,
        deliveryFeeFormatted: 'R$ 12,00',
        estimatedTime: '45 a 55 minutos',
        withinRange: true,
        notes: 'Entrega por motoboy dedicado com bag térmica.'
      };
    } else if (distanceKm <= 15.0) {
      return {
        distanceKm,
        deliveryFee: 18.0,
        deliveryFeeFormatted: 'R$ 18,00',
        estimatedTime: '50 a 65 minutos',
        withinRange: true,
        notes: 'Raio estendido de entrega.'
      };
    } else {
      return {
        distanceKm,
        deliveryFee: 25.0,
        deliveryFeeFormatted: 'R$ 25,00 (Sob consulta especial)',
        estimatedTime: '60 a 75 minutos',
        withinRange: false,
        notes: 'Distância acima do raio habitual de moto. Recomendamos também nossa Retirada no Balcão Express (Grátis em 20 min)!'
      };
    }
  }

  /**
   * Resolve coordenadas de GPS enviadas pelo WhatsApp (lat, lng) e calcula distância e endereço
   */
  public async resolveCoordinates(
    lat: number,
    lng: number,
    providedName?: string,
    providedAddress?: string
  ): Promise<GeocodedLocation> {
    const distanceKm = this.calculateDistance(
      this.baseLocation.lat,
      this.baseLocation.lng,
      lat,
      lng
    );
    const quote = this.getDeliveryQuote(distanceKm);
    const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;

    let resolvedAddress = providedAddress || providedName || '';
    let neighborhood = '';
    let city = '';
    let state = '';

    // Tenta obter o endereço detalhado via OpenStreetMap Nominatim
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);

      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'SecretariaVirtualIA/1.0 (delivery@fornoesabor.com.br)',
          'Accept-Language': 'pt-BR,pt;q=0.9'
        }
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data: any = await res.json();
        if (data && data.address) {
          const addr = data.address;
          const road = addr.road || addr.street || addr.pedestrian || '';
          const houseNumber = addr.house_number ? `, ${addr.house_number}` : '';
          neighborhood = addr.suburb || addr.neighbourhood || addr.city_district || '';
          city = addr.city || addr.town || addr.municipality || 'São Paulo';
          state = addr.state || 'SP';

          const parts = [road + houseNumber, neighborhood, city, state].filter(Boolean);
          if (parts.length > 0) {
            resolvedAddress = parts.join(' - ');
          } else if (data.display_name) {
            resolvedAddress = data.display_name;
          }
        }
      }
    } catch (e) {
      // Se der timeout ou offline, mantém o que foi fornecido ou coordenadas
    }

    if (!resolvedAddress) {
      resolvedAddress = `Coordenadas GPS (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
    }

    return {
      latitude: lat,
      longitude: lng,
      address: resolvedAddress,
      neighborhood,
      city,
      state,
      mapUrl,
      ...quote
    };
  }

  /**
   * Busca endereço por CEP ou texto e calcula a taxa de entrega
   */
  public async searchAddressOrCep(query: string): Promise<GeocodedLocation | null> {
    if (!query || !query.trim()) return null;
    const cleanQuery = query.trim();

    // 1. Verifica se é um CEP brasileiro (8 dígitos)
    const cepMatch = cleanQuery.replace(/\D/g, '');
    let searchString = cleanQuery;

    if (cepMatch.length === 8 && /^[0-9]{8}$/.test(cepMatch)) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const viaCepRes = await fetch(`https://viacep.com.br/ws/${cepMatch}/json/`, {
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (viaCepRes.ok) {
          const cepData: any = await viaCepRes.json();
          if (!cepData.erro) {
            searchString = `${cepData.logradouro || ''}, ${cepData.bairro || ''}, ${cepData.localidade || 'São Paulo'} - ${cepData.uf || 'SP'}`;
          }
        }
      } catch (e) {}
    }

    // 2. Busca coordenadas no Nominatim
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      // Adiciona contexto do Brasil caso não tenha
      const finalSearch = searchString.toLowerCase().includes('brasil')
        ? searchString
        : `${searchString}, Brasil`;

      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        finalSearch
      )}&limit=1&addressdetails=1`;

      const res = await fetch(nominatimUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'SecretariaVirtualIA/1.0 (delivery@fornoesabor.com.br)',
          'Accept-Language': 'pt-BR,pt;q=0.9'
        }
      });
      clearTimeout(timeout);

      if (res.ok) {
        const list: any = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          const item = list[0];
          const lat = parseFloat(item.lat);
          const lng = parseFloat(item.lon);

          return await this.resolveCoordinates(lat, lng, undefined, item.display_name);
        }
      }
    } catch (e) {}

    // Fallback aproximado se não achou via geocoding
    const estimatedDistance = 4.5;
    const quote = this.getDeliveryQuote(estimatedDistance);
    return {
      latitude: this.baseLocation.lat,
      longitude: this.baseLocation.lng,
      address: cleanQuery,
      mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanQuery)}`,
      ...quote
    };
  }

  /**
   * Formata a mensagem de localização para ser injetada no chat da IA
   */
  public formatLocationPromptBlock(loc: GeocodedLocation): string {
    return `
📍 [LOCALIZAÇÃO GEOGRÁFICA / GPS RECEBIDA]:
- Endereço / Referência: ${loc.address}
- Distância calculada da Pizzaria: ${loc.distanceKm} km
- Taxa de Entrega: ${loc.deliveryFeeFormatted}
- Tempo Estimado de Entrega: ${loc.estimatedTime}
- Status da Região: ${loc.withinRange ? '✅ Dentro do raio de entrega expressa!' : '⚠️ Fora do raio habitual de moto (consulte retirada ou taxa especial)'}
- Link Google Maps: ${loc.mapUrl}
${loc.notes ? `- Observação da Rota: ${loc.notes}` : ''}
`.trim();
  }
}

export const geocodingService = new GeocodingService();
