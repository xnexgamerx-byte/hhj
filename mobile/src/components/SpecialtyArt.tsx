import { useMemo } from "react";
import { View } from "react-native";
import { SvgAst, parse, type JsxAST } from "react-native-svg";

import { SpecialtyIcon } from "@/components/icons";
import { SPECIALTY_ART } from "@/components/specialty-art";

/**
 * رسمة التخصص الملوّنة.
 *
 * نحلّل نصّ الـSVG مرّةً واحدة ونخزّن الشجرة: `SvgXml` يعيد التحليل في كل رسم،
 * وشبكة التخصصات تُعاد رسمتها مع كل تمرير للقائمة — فيصير التحليل أثقل من الرسم.
 *
 * وما لا رسمة له يقع على الأيقونة الخطّية: تخصصٌ يضيفه المالك لاحقاً يظهر
 * بسمّاعةٍ مفهومة لا بمربّعٍ فارغ.
 */
const CACHE = new Map<string, JsxAST | null>();

function astFor(slug: string): JsxAST | null {
  const cached = CACHE.get(slug);
  if (cached !== undefined) return cached;
  const body = SPECIALTY_ART[slug];
  const ast = body ? parse(`<svg viewBox="0 0 64 64">${body}</svg>`) : null;
  CACHE.set(slug, ast);
  return ast;
}

export function SpecialtyArt({ slug, size = 40, color }: { slug: string; size?: number; color?: string }) {
  const ast = useMemo(() => astFor(slug), [slug]);
  if (!ast) return <SpecialtyIcon slug={slug} size={size * 0.72} color={color} />;
  return (
    <View style={{ width: size, height: size }}>
      <SvgAst ast={ast} override={{ width: size, height: size }} />
    </View>
  );
}

export const hasSpecialtyArt = (slug: string) => slug in SPECIALTY_ART;
