import {
  NumberInput,
  NumberInputField,
  Slider,
  SliderFilledTrack,
  SliderThumb,
  SliderTrack,
} from "@chakra-ui/react";

export function FgSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="fg-slider">
      <div className="fg-slider-label">{label}</div>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        focusThumbOnChange={false}
        onChange={onChange}
      >
        <SliderTrack bg="myGray.200" h="6px" borderRadius="full">
          <SliderFilledTrack bg="primary.500" />
        </SliderTrack>
        <SliderThumb boxSize={4} border="2px solid" borderColor="primary.500" />
      </Slider>
      <NumberInput
        size="sm"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(_, n) => {
          if (Number.isFinite(n)) onChange(n);
        }}
      >
        <NumberInputField px={1} textAlign="center" />
      </NumberInput>
    </div>
  );
}
