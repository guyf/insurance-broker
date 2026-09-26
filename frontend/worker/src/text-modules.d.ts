// .md files are bundled as text by the [[rules]] entry in wrangler.toml.
declare module "*.md" {
  const content: string;
  export default content;
}
