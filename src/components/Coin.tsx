import { Image } from 'react-native';

/** The Fshow Coin (FC) picture. */
export function Coin({ size = 18 }: { size?: number }) {
  return <Image source={size > 64 ? require('../../assets/coins/fshow-coin-128.png') : require('../../assets/coins/fshow-coin-64.png')} style={{ width: size, height: size }} />;
}
