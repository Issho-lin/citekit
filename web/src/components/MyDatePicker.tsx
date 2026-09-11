import { useMemo, useState } from "react";
import { Box, Button, Flex, Grid, Popover, PopoverBody, PopoverContent, PopoverTrigger } from "@chakra-ui/react";
import { IconChevron, IconChevronDown } from "./icons";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return date;
}

function monthCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ key: string; day?: number; value?: string }> = [];
  for (let i = 0; i < start; i++) cells.push({ key: `e-${i}` });
  for (let day = 1; day <= days; day++) {
    const value = ymd(new Date(year, month, day));
    cells.push({ key: value, day, value });
  }
  return cells;
}

export function MyDatePicker({
  value,
  onChange,
  placeholder = "全部日期",
  w = "160px",
  h = "32px",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  w?: string | number;
  h?: string | number;
}) {
  const selected = parseDay(value);
  const today = ymd(new Date());
  const initial = selected ?? new Date();
  const [cursor, setCursor] = useState({ year: initial.getFullYear(), month: initial.getMonth() });
  const cells = useMemo(() => monthCells(cursor.year, cursor.month), [cursor.month, cursor.year]);
  const label = selected ? `${selected.getMonth() + 1}月${selected.getDate()}日` : placeholder;

  return (
    <Popover
      placement="bottom-start"
      strategy="fixed"
      isLazy
      gutter={6}
      onOpen={() => {
        const date = parseDay(value) ?? new Date();
        setCursor({ year: date.getFullYear(), month: date.getMonth() });
      }}
    >
      {({ onClose }) => (
        <>
          <PopoverTrigger>
            <Button
              type="button"
              variant="whitePrimaryOutline"
              size="md"
              w={w}
              h={h}
              minH={h}
              px={3}
              fontSize="sm"
              fontWeight="normal"
              textAlign="left"
              justifyContent="space-between"
              color={value ? "myGray.700" : "myGray.500"}
              _active={{ transform: "none" }}
              _expanded={{
                color: "primary.700",
                borderColor: "primary.300",
                boxShadow: "0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)",
                bg: "#fff",
              }}
              rightIcon={
                <Box color="myGray.500">
                  <IconChevronDown />
                </Box>
              }
            >
              <Box overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                {label}
              </Box>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            w="280px"
            bg="white"
            border="1px solid #fff"
            borderRadius="md"
            boxShadow="0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25)"
            _focus={{ outline: "none" }}
          >
            <PopoverBody p={3}>
              <Flex align="center" justify="space-between" mb={2}>
                <Button
                  size="sm"
                  variant="ghost"
                  px={1}
                  minW="28px"
                  onClick={() =>
                    setCursor((cur) =>
                      cur.month === 0 ? { year: cur.year - 1, month: 11 } : { year: cur.year, month: cur.month - 1 },
                    )
                  }
                  aria-label="上一月"
                >
                  <Box transform="rotate(180deg)">
                    <IconChevron size={14} />
                  </Box>
                </Button>
                <Box fontSize="sm" fontWeight="600" color="myGray.800">
                  {cursor.year}年{cursor.month + 1}月
                </Box>
                <Button
                  size="sm"
                  variant="ghost"
                  px={1}
                  minW="28px"
                  onClick={() =>
                    setCursor((cur) =>
                      cur.month === 11 ? { year: cur.year + 1, month: 0 } : { year: cur.year, month: cur.month + 1 },
                    )
                  }
                  aria-label="下一月"
                >
                  <IconChevron size={14} />
                </Button>
              </Flex>
              <Grid templateColumns="repeat(7, 1fr)" gap="2px" mb={1}>
                {WEEKDAYS.map((name) => (
                  <Box key={name} textAlign="center" fontSize="12px" color="myGray.500" py={1}>
                    {name}
                  </Box>
                ))}
                {cells.map((cell) => {
                  if (!cell.value) return <Box key={cell.key} h="32px" />;
                  const active = cell.value === value;
                  const isToday = cell.value === today;
                  return (
                    <Button
                      key={cell.key}
                      type="button"
                      variant="ghost"
                      h="32px"
                      minW="0"
                      px={0}
                      fontSize="sm"
                      fontWeight={active || isToday ? "600" : "normal"}
                      color={active ? "white" : isToday ? "primary.700" : "myGray.800"}
                      bg={active ? "primary.500" : "transparent"}
                      _hover={{ bg: active ? "primary.500" : "myGray.100" }}
                      onClick={() => {
                        onChange(cell.value || "");
                        onClose();
                      }}
                    >
                      {cell.day}
                    </Button>
                  );
                })}
              </Grid>
              <Flex justify="space-between" mt={2}>
                <Button
                  size="sm"
                  variant="ghost"
                  color="myGray.600"
                  onClick={() => {
                    onChange("");
                    onClose();
                  }}
                >
                  全部日期
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  color="primary.700"
                  onClick={() => {
                    const next = ymd(new Date());
                    const date = new Date();
                    setCursor({ year: date.getFullYear(), month: date.getMonth() });
                    onChange(next);
                    onClose();
                  }}
                >
                  今天
                </Button>
              </Flex>
            </PopoverBody>
          </PopoverContent>
        </>
      )}
    </Popover>
  );
}
