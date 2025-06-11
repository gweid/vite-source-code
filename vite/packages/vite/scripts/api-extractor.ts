// api-extractor 的作用： 将多个 .d.ts 合并为单个文件，移除未导出的类型
import { Extractor, ExtractorConfig } from '@microsoft/api-extractor'

const result = Extractor.invoke(
  ExtractorConfig.loadFileAndPrepare('./api-extractor.json'),
  {
    messageCallback: (message) => {
      const ignore = () => {
        // @ts-expect-error TS requires to use the const enum, which is not available as the named export in tsx
        message.logLevel = 'none'
      }
      if (message.sourceFilePath?.includes('lightningcss')) {
        ignore()
      }
      if (message.messageId === 'ae-forgotten-export') {
        if (message.sourceFilePath?.endsWith('/src/types/lightningcss.d.ts')) {
          // We only expose LightningCSS types via prefixed types to avoid
          // having confusing name like "Targets" in Vite types
          ignore()
        }
      }
    },
  },
)

if (!result.succeeded) process.exit(1)
