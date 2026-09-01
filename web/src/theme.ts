import { extendTheme } from "@chakra-ui/react";

const primary = {
  50: "#f0f4ff",
  100: "#e8f3ff",
  200: "#c9dcff",
  300: "#90b5ff",
  400: "#5b8cff",
  500: "#3370ff",
  600: "#245bdb",
  700: "#1c4cbc",
  800: "#1d4dd4",
  900: "#1237a3",
};

const myGray = {
  0: "#ffffff",
  50: "#f7f8fa",
  100: "#f4f4f7",
  150: "#f0f1f6",
  200: "#e8ebf0",
  250: "#e2e3ea",
  300: "#d0d5dd",
  400: "#98a2b3",
  500: "#667085",
  600: "#4e5969",
  700: "#344054",
  800: "#1d2129",
  900: "#111824",
};

const focusRing = {
  borderColor: "primary.500",
  boxShadow: "0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)",
};

const field = {
  bg: "white",
  border: "1px solid",
  borderColor: "myGray.200",
  borderRadius: "6px",
  fontSize: "14px",
  color: "myGray.900",
  _placeholder: { color: "myGray.400" },
  _hover: { borderColor: "primary.300" },
  _focus: focusRing,
  _focusVisible: focusRing,
};

export const theme = extendTheme({
  colors: { primary, myGray },
  fonts: {
    heading:
      '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", -apple-system, BlinkMacSystemFont, sans-serif',
    body: '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  shadows: {
    outline: "0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)",
    3: "0px 4px 10px 0px rgba(19, 51, 107, 0.08), 0px 0px 1px 0px rgba(19, 51, 107, 0.08)",
  },
  radii: {
    sm: "4px",
    md: "6px",
    lg: "8px",
    xl: "12px",
  },
  styles: {
    global: {
      body: {
        bg: "myGray.50",
        color: "myGray.900",
        fontSize: "14px",
      },
    },
  },
  components: {
    Button: {
      baseStyle: {
        fontWeight: 500,
        borderRadius: "md",
      },
      defaultProps: {
        colorScheme: "primary",
        size: "sm",
      },
      sizes: {
        sm: { h: "36px", px: "14px", fontSize: "14px" },
        smSquare: { h: "30px", w: "30px", minH: "30px", px: 0, fontSize: "14px" },
        xsSquare: { h: "24px", w: "24px", minH: "24px", px: 0, fontSize: "12px" },
        md: { h: "40px", px: "16px", fontSize: "14px" },
      },
      variants: {
        whitePrimary: {
          color: "primary.600",
          border: "1px solid",
          borderColor: "primary.200",
          bg: "white",
          _hover: { bg: "primary.50" },
        },
        whiteBase: {
          color: "myGray.600",
          border: "1px solid",
          borderColor: "myGray.250",
          bg: "white",
          _hover: { color: "primary.600" },
        },
        whitePrimaryOutline: {
          border: "1px solid",
          borderColor: "myGray.250",
          bg: "white",
          color: "myGray.700",
          fontWeight: "normal",
          transition: "border-color 0.1s ease-in-out, box-shadow 0.1s ease-in-out",
          _hover: { color: "primary.600", borderColor: "primary.300" },
          _active: { transform: "none", bg: "white" },
          _expanded: {
            color: "primary.700",
            borderColor: "primary.300",
            boxShadow: "0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)",
          },
        },
        grayDanger: {
          bg: "myGray.150",
          color: "myGray.600",
          _hover: { color: "red.600", bg: "red.50" },
        },
        whiteDanger: {
          color: "myGray.600",
          border: "1px solid",
          borderColor: "myGray.250",
          bg: "white",
          _hover: { color: "red.600", borderColor: "red.300", bg: "red.50" },
          _active: { color: "red.600" },
        },
      },
    },
    Input: {
      defaultProps: { size: "md", focusBorderColor: "primary.500" },
      variants: {
        outline: { field },
      },
    },
    NumberInput: {
      defaultProps: { size: "md", focusBorderColor: "primary.500" },
      variants: {
        outline: { field },
      },
    },
    Textarea: {
      defaultProps: { size: "md", focusBorderColor: "primary.500" },
      variants: {
        outline: field,
      },
    },
    Select: {
      defaultProps: { size: "md", focusBorderColor: "primary.500" },
      variants: {
        outline: { field },
      },
    },
    Switch: {
      defaultProps: { colorScheme: "primary" },
    },
    Checkbox: {
      defaultProps: { colorScheme: "primary" },
    },
    Tabs: {
      variants: {
        enclosed: {
          tab: {
            fontSize: "14px",
            _selected: { color: "primary.500", borderColor: "primary.500" },
          },
        },
      },
    },
    Modal: {
      baseStyle: {
        dialog: {
          borderRadius: "lg",
          boxShadow: "0 8px 28px rgba(19, 51, 107, 0.12)",
        },
      },
    },
    Menu: {
      baseStyle: {
        list: {
          borderRadius: "lg",
          borderColor: "myGray.200",
          boxShadow: "0 8px 28px rgba(19, 51, 107, 0.12)",
          py: 2,
        },
        item: {
          fontSize: "14px",
          borderRadius: "md",
          mx: 1,
          w: "calc(100% - 8px)",
        },
      },
    },
    Alert: {
      baseStyle: {
        container: { borderRadius: "md", fontSize: "13px" },
      },
    },
  },
});
