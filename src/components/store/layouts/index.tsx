import type { LayoutProps } from "../types";
import { EditorialLayout } from "./editorial";
import { GridLayout } from "./grid";
import { SpotlightLayout } from "./spotlight";

export function StoreHome(props: LayoutProps) {
  if (props.theme.layout === "editorial") return <EditorialLayout {...props} />;
  if (props.theme.layout === "spotlight") return <SpotlightLayout {...props} />;
  return <GridLayout {...props} />;
}
