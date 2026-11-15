import { declare } from "@babel/helper-plugin-utils";
import { types as t, type NodePath } from "@babel/core";

export default declare(api => {
  api.assertVersion(REQUIRED_VERSION("^7.0.0-0 || ^8.0.0"));

  return {
    name: "transform-new-target",

    visitor: {
      MetaProperty(path) {
        const meta = path.get("meta");
        const property = path.get("property");
        const { scope } = path;

        if (
          meta.isIdentifier({ name: "new" }) &&
          property.isIdentifier({ name: "target" })
        ) {
          const func = path.findParent(path => {
            if (path.isClass()) return true;
            if (path.isFunction() && !path.isArrowFunctionExpression()) {
              if (path.isClassMethod({ kind: "constructor" })) {
                return false;
              }

              return true;
            }
            return false;
          }) as NodePath<
            | t.FunctionDeclaration
            | t.FunctionExpression
            | t.Class
            | t.ClassMethod
            | t.ClassPrivateMethod
          >;

          if (!func) {
            throw path.buildCodeFrameError(
              "new.target must be under a (non-arrow) function or a class.",
            );
          }

          const { node } = func;
          if (t.isMethod(node)) {
            path.replaceWith(t.buildUndefinedNode());
            return;
          }

          const constructor = t.memberExpression(
            t.thisExpression(),
            t.identifier("constructor"),
          );

          if (func.isClass()) {
            path.replaceWith(constructor);
            return;
          }

          if (!node.id) {
            node.id = scope.generateUidIdentifier("target");
          } else {
            const id = node.id;
            const name = id.name;
            const isFunctionExpression = func.isFunctionExpression();

            // temporarily remove the function expression's name and rebuild local bindings
            if (isFunctionExpression) {
              node.id = null;
              func.scope.crawl();
            }

            // rename local bindings that shadow the function name
            let scope = path.scope;
            while (scope !== func.parentPath.scope) {
              if (
                scope.hasOwnBinding(name) &&
                !scope.bindingIdentifierEquals(name, id)
              ) {
                scope.rename(name);
              }
              scope = scope.parent!;
            }

            // restore the function name and refresh scope bindings
            node.id = id;

            if (isFunctionExpression) {
              func.scope.crawl();
            }
          }

          path.replaceWith(
            t.conditionalExpression(
              t.binaryExpression(
                "instanceof",
                t.thisExpression(),
                t.cloneNode(node.id),
              ),
              constructor,
              t.buildUndefinedNode(),
            ),
          );
        }
      },
    },
  };
});
