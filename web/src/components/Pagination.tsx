import { Box, Flex, IconButton } from "@chakra-ui/react";
import { IconChevron } from "./icons";
import { MySelect } from "./MySelect";

const PAGE_SIZES = [10, 20, 50];

export function Pagination({
  count,
  page,
  pageSize,
  pageSizeOptions = PAGE_SIZES,
  onPageChange,
  onPageSizeChange,
  isDisabled,
}: {
  count: number;
  page: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  isDisabled?: boolean;
}) {
  const maxPage = Math.max(1, Math.ceil(count / pageSize));
  const current = Math.min(page, maxPage);

  return (
    <Flex className="table-pager" fontSize="sm" userSelect="none" justify="space-between">
      <Box color="myGray.500">共 {count} 条</Box>
      <Flex align="center">
        <Flex align="center" mr={3} gap={1}>
          <IconButton
            aria-label="上一页"
            size="xsSquare"
            variant="ghost"
            isDisabled={current <= 1 || isDisabled}
            icon={
              <Box display="inline-flex" transform="rotate(180deg)">
                <IconChevron size={12} />
              </Box>
            }
            onClick={() => onPageChange(current - 1)}
          />
          <Box ml={2} color="myGray.500">
            {current}
          </Box>
          <Box mx={1} color="myGray.500">
            /
          </Box>
          <Box mr={2} color="myGray.900">
            {maxPage}
          </Box>
          <IconButton
            aria-label="下一页"
            size="xsSquare"
            variant="ghost"
            isDisabled={current >= maxPage || isDisabled}
            icon={<IconChevron size={12} />}
            onClick={() => onPageChange(current + 1)}
          />
        </Flex>
        {onPageSizeChange ? (
          <MySelect
            h="32px"
            w="108px"
            isDisabled={isDisabled}
            value={String(pageSize)}
            onChange={(next) => onPageSizeChange(Number(next) || pageSize)}
            list={pageSizeOptions.map((n) => ({ value: String(n), label: `${n} 条/页` }))}
          />
        ) : null}
      </Flex>
    </Flex>
  );
}
