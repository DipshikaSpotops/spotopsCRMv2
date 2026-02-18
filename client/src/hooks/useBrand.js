import { useEffect, useState } from "react";
import { getCurrentBrand, onBrandChange } from "../utils/brand";

export default function useBrand() {
  const [brand, setBrand] = useState(() => getCurrentBrand());

  useEffect(() => {
    const off = onBrandChange((next) => {
      if (!next) return;
      setBrand(next.toUpperCase());
    });
    return off;
  }, []);

  return brand;
}

