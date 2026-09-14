import { useMemo, useRef, useState, type MouseEvent, type ReactNode, type UIEvent } from "react";
import {
  Box,
  Button,
  Flex,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
} from "@chakra-ui/react";
import { IconChevronDown } from "./icons";

export type SelectOption = {
  label: string;
  value: string;
  description?: string;
  icon?: ReactNode;
};

const ROW_H = 36;
const LIST_H = 280;
const OVERSCAN = 8;
const VIRTUAL_AFTER = 40;

const triggerSx = {
  size: "md" as const,
  variant: "whitePrimaryOutline" as const,
  fontSize: "sm",
  fontWeight: "normal" as const,
  textAlign: "left" as const,
  justifyContent: "space-between" as const,
  color: "myGray.700",
  _active: { transform: "none" },
  _expanded: {
    color: "primary.700",
    borderColor: "primary.300",
    boxShadow: "0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)",
    bg: "#fff",
  },
};

const menuPanelSx = {
  px: "6px",
  py: "6px",
  bg: "white",
  border: "1px solid #fff",
  borderRadius: "md",
  boxShadow: "0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25)",
  zIndex: 1800,
} as const;

export function MySelect({
  value,
  list,
  onChange,
  placeholder = "请选择",
  w = "100%",
  h = "40px",
  searchable = false,
  allowCustom = false,
  isDisabled = false,
  truncate = true,
}: {
  value: string;
  list: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  w?: string | number;
  h?: string | number;
  searchable?: boolean;
  allowCustom?: boolean;
  isDisabled?: boolean;
  truncate?: boolean;
}) {
  if (searchable) {
    return (
      <SearchableSelect
        value={value}
        list={list}
        onChange={onChange}
        placeholder={placeholder}
        w={w}
        h={h}
        allowCustom={allowCustom}
        isDisabled={isDisabled}
        truncate={truncate}
      />
    );
  }
  return (
    <MenuSelect
      value={value}
      list={list}
      onChange={onChange}
      placeholder={placeholder}
      w={w}
      h={h}
      isDisabled={isDisabled}
      truncate={truncate}
    />
  );
}

function TriggerLabel({
  selected,
  value,
  placeholder,
  truncate = true,
}: {
  selected?: SelectOption;
  value: string;
  placeholder: string;
  truncate?: boolean;
}) {
  return (
    <Flex align="center" gap={2} minW={truncate ? 0 : "max-content"} flex={truncate ? "1" : "0 0 auto"}>
      {selected?.icon}
      <Box
        overflow={truncate ? "hidden" : "visible"}
        textOverflow={truncate ? "ellipsis" : "clip"}
        whiteSpace="nowrap"
      >
        {selected?.label ?? (value || placeholder)}
      </Box>
    </Flex>
  );
}

function MenuSelect({
  value,
  list,
  onChange,
  placeholder,
  w,
  h,
  isDisabled,
  truncate = true,
}: {
  value: string;
  list: SelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
  w: string | number;
  h: string | number;
  isDisabled: boolean;
  truncate?: boolean;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuMinW, setMenuMinW] = useState<number>();
  const selected = useMemo(() => list.find((item) => item.value === value), [list, value]);
  const hasDesc = list.some((item) => item.description);
  const minW = menuMinW ? `${menuMinW}px` : w;

  return (
    <Menu
      autoSelect={false}
      strategy="fixed"
      placement="bottom-start"
      matchWidth={!hasDesc}
      isLazy
      onOpen={() => {
        const width = buttonRef.current?.getBoundingClientRect().width;
        if (width) setMenuMinW(Math.ceil(width));
      }}
    >
      {({ onClose }) => (
        <>
          <MenuButton
            as={Button}
            ref={buttonRef}
            type="button"
            {...triggerSx}
            w={w}
            h={h}
            minH={h}
            px={3}
            isDisabled={isDisabled}
            rightIcon={
              <Box color="myGray.500">
                <IconChevronDown />
              </Box>
            }
          >
            <TriggerLabel selected={selected} value={value} placeholder={placeholder} truncate={truncate} />
          </MenuButton>
          <MenuList
            minW={minW}
            w={hasDesc ? "max-content" : minW}
            maxW="90vw"
            maxH="45vh"
            overflowY="auto"
            {...menuPanelSx}
          >
            {list.map((item) => {
              const active = item.value === value;
              return (
                <MenuItem
                  key={item.value || item.label}
                  borderRadius="sm"
                  py={2}
                  mb={0.5}
                  display="block"
                  whiteSpace="pre-wrap"
                  fontSize="sm"
                  color={active ? "primary.700" : "myGray.900"}
                  bg={active ? "myGray.100" : "transparent"}
                  _hover={{ bg: "myGray.100" }}
                  _notLast={{ mb: 1 }}
                  onClick={() => {
                    if (!active) onChange(item.value);
                    onClose();
                  }}
                >
                  <OptionRow item={item} />
                </MenuItem>
              );
            })}
          </MenuList>
        </>
      )}
    </Menu>
  );
}

function SearchableSelect({
  value,
  list,
  onChange,
  placeholder,
  w,
  h,
  allowCustom,
  isDisabled,
  truncate = true,
}: {
  value: string;
  list: SelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
  w: string | number;
  h: string | number;
  allowCustom: boolean;
  isDisabled: boolean;
  truncate?: boolean;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [menuMinW, setMenuMinW] = useState<number>();
  const [query, setQuery] = useState("");
  const selected = useMemo(() => list.find((item) => item.value === value), [list, value]);
  const hasDesc = list.some((item) => item.description);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return list;
    return list.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.value.toLowerCase().includes(q) ||
        (item.description ?? "").toLowerCase().includes(q),
    );
  }, [list, q]);
  const showCustom =
    allowCustom && q && !list.some((item) => item.value === query.trim() || item.label === query.trim());
  const minW = menuMinW ? `${menuMinW}px` : w;
  const useVirtual = filtered.length > VIRTUAL_AFTER;

  function pick(next: string, onClose: () => void) {
    if (next !== value) onChange(next);
    onClose();
  }

  return (
    <Popover
      isLazy
      placement="bottom-start"
      strategy="fixed"
      matchWidth={!hasDesc}
      initialFocusRef={searchRef}
      gutter={4}
      onOpen={() => {
        setQuery("");
        const width = buttonRef.current?.getBoundingClientRect().width;
        if (width) setMenuMinW(Math.ceil(width));
      }}
    >
      {({ onClose }) => (
        <>
          <PopoverTrigger>
            <Button
              ref={buttonRef}
              type="button"
              {...triggerSx}
              w={w}
              h={h}
              minH={h}
              px={3}
              isDisabled={isDisabled}
              rightIcon={
                <Box color="myGray.500">
                  <IconChevronDown />
                </Box>
              }
            >
              <TriggerLabel selected={selected} value={value} placeholder={placeholder} truncate={truncate} />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            minW={minW}
            w={hasDesc ? "max-content" : minW}
            maxW="90vw"
            p={0}
            outline="none"
            _focus={{ outline: "none", boxShadow: menuPanelSx.boxShadow }}
            _focusVisible={{ outline: "none", boxShadow: menuPanelSx.boxShadow }}
            {...menuPanelSx}
          >
            <PopoverBody p={0}>
              <Box px={1} py={1} mb={1}>
                <Input
                  ref={searchRef}
                  h="32px"
                  minH="32px"
                  fontSize="sm"
                  placeholder="搜索"
                  autoComplete="off"
                  name="citekit-select-filter"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") onClose();
                    if (e.key === "Enter" && showCustom) {
                      e.preventDefault();
                      pick(query.trim(), onClose);
                    }
                  }}
                />
              </Box>
              {showCustom ? (
                <Box
                  as="button"
                  type="button"
                  w="100%"
                  textAlign="left"
                  borderRadius="sm"
                  py={2}
                  px={3}
                  fontSize="sm"
                  _hover={{ bg: "myGray.100" }}
                  onMouseDown={(e: MouseEvent) => e.preventDefault()}
                  onClick={() => pick(query.trim(), onClose)}
                >
                  使用「{query.trim()}」
                </Box>
              ) : null}
              {filtered.length === 0 && !showCustom ? (
                <Box px={3} py={2} fontSize="13px" color="myGray.500">
                  没有匹配项
                </Box>
              ) : useVirtual ? (
                <VirtualOptionList items={filtered} value={value} onPick={(next) => pick(next, onClose)} />
              ) : (
                filtered.map((item) => {
                  const active = item.value === value;
                  return (
                    <Box
                      key={item.value || item.label}
                      as="button"
                      type="button"
                      w="100%"
                      textAlign="left"
                      borderRadius="sm"
                      py={2}
                      px={2}
                      mb={0.5}
                      display="block"
                      whiteSpace="pre-wrap"
                      fontSize="sm"
                      color={active ? "primary.700" : "myGray.900"}
                      bg={active ? "myGray.100" : "transparent"}
                      _hover={{ bg: "myGray.100" }}
                      onMouseDown={(e: MouseEvent) => e.preventDefault()}
                      onClick={() => pick(item.value, onClose)}
                    >
                      <OptionRow item={item} />
                    </Box>
                  );
                })
              )}
            </PopoverBody>
          </PopoverContent>
        </>
      )}
    </Popover>
  );
}

function OptionRow({ item }: { item: SelectOption }) {
  return (
    <>
      <Flex alignItems="center" gap={2}>
        {item.icon}
        {item.label}
      </Flex>
      {item.description ? (
        <Box color="myGray.500" fontSize="xs" mt="2px" lineHeight="1.4" pl={item.icon ? "24px" : 0}>
          {item.description}
        </Box>
      ) : null}
    </>
  );
}

function VirtualOptionList({
  items,
  value,
  onPick,
}: {
  items: SelectOption[];
  value: string;
  onPick: (value: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visible = Math.ceil(LIST_H / ROW_H) + OVERSCAN * 2;
  const end = Math.min(items.length, start + visible);
  const slice = items.slice(start, end);

  function onScroll(e: UIEvent<HTMLDivElement>) {
    setScrollTop(e.currentTarget.scrollTop);
  }

  return (
    <Box ref={parentRef} h={`${LIST_H}px`} overflowY="auto" onScroll={onScroll}>
      <Box h={`${items.length * ROW_H}px`} position="relative">
        {slice.map((item, i) => {
          const index = start + i;
          const active = item.value === value;
          return (
            <Box
              key={item.value || `${index}`}
              as="button"
              type="button"
              position="absolute"
              top={0}
              left={0}
              w="100%"
              h={`${ROW_H}px`}
              transform={`translateY(${index * ROW_H}px)`}
              px={2}
              display="flex"
              alignItems="center"
              textAlign="left"
              fontSize="sm"
              color={active ? "primary.700" : "myGray.900"}
              bg={active ? "myGray.100" : "transparent"}
              _hover={{ bg: "myGray.100" }}
              onMouseDown={(e: MouseEvent) => e.preventDefault()}
              onClick={() => onPick(item.value)}
            >
              <Box overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" w="100%">
                {item.label}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
