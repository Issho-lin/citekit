import { useRef, useState } from "react";
import {
  Box,
  Button,
  Flex,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
} from "@chakra-ui/react";
import { IconChevronDown } from "./icons";

export function MySelect({
  value,
  list,
  onChange,
  placeholder = "请选择",
  w = "100%",
  h = "40px",
}: {
  value: string;
  list: { label: string; value: string; description?: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
  w?: string | number;
  h?: string | number;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuMinW, setMenuMinW] = useState<number>();
  const selected = list.find((item) => item.value === value);
  const hasDesc = list.some((item) => item.description);

  function syncMenuWidth() {
    const width = buttonRef.current?.getBoundingClientRect().width;
    if (width) setMenuMinW(Math.ceil(width));
  }

  const minW = menuMinW ? `${menuMinW}px` : w;

  return (
    <Menu
      autoSelect={false}
      strategy="fixed"
      placement="bottom-start"
      matchWidth={!hasDesc}
      onOpen={syncMenuWidth}
    >
      <MenuButton
        ref={buttonRef}
        as={Button}
        type="button"
        w={w}
        h={h}
        minH={h}
        px={3}
        size="md"
        variant="whitePrimaryOutline"
        fontSize="sm"
        fontWeight="normal"
        textAlign="left"
        color="myGray.700"
        rightIcon={
          <Box color="myGray.500">
            <IconChevronDown />
          </Box>
        }
        _active={{ transform: "none" }}
        _expanded={{
          color: "primary.700",
          borderColor: "primary.300",
          boxShadow: "0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)",
          bg: "#fff",
        }}
        sx={{
          "& > span:first-of-type": {
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "block",
            textAlign: "left",
          },
        }}
      >
        {selected?.label ?? placeholder}
      </MenuButton>
      <MenuList
        minW={minW}
        w={hasDesc ? "max-content" : minW}
        maxW="90vw"
        px="6px"
        py="6px"
        border="1px solid #fff"
        boxShadow="0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25)"
        zIndex={1500}
        maxH="45vh"
        overflowY="auto"
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
              }}
            >
              <Flex alignItems="center">{item.label}</Flex>
              {item.description ? (
                <Box color="myGray.500" fontSize="xs" mt="2px" lineHeight="1.4">
                  {item.description}
                </Box>
              ) : null}
            </MenuItem>
          );
        })}
      </MenuList>
    </Menu>
  );
}
