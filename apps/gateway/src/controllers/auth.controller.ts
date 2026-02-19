import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthLoginDto } from '../dto/auth-login.dto';
import { AuthRegisterPasswordDto } from '../dto/auth-register-password.dto';
import { AuthUpdateLocalCredentialDto } from '../dto/auth-update-local-credential.dto';
import { jsonPlan } from '../gatewayDashboardHelpers';
import { writePlan } from '../planWriter';
import { AuthService, AuthServiceError } from '../services/auth.service';

const DEFAULT_POST_LOGIN_PATH = '/';

const parseError = (error: unknown): { status: number; code: string; message: string } => {
  if (error instanceof AuthServiceError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message
    };
  }
  return {
    status: 500,
    code: 'internal_error',
    message: '인증 처리 중 오류가 발생했습니다.'
  };
};

const appendQuery = (path: string, key: string, value: string): string => {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
};

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('me')
  async me(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const user = await this.auth.authenticateFromHeaders(request.headers as Record<string, unknown>);
    if (!user) {
      writePlan(
        reply,
        jsonPlan(401, {
          ok: false,
          code: 'unauthorized',
          message: '로그인이 필요합니다.'
        })
      );
      return;
    }
    writePlan(
      reply,
      jsonPlan(200, {
        ok: true,
        user,
        githubEnabled: this.auth.isGithubEnabled()
      })
    );
  }

  @Post('login')
  async login(
    @Body() body: AuthLoginDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    try {
      const session = await this.auth.loginWithPassword(body.loginId, body.password);
      reply.header('set-cookie', this.auth.serializeSessionCookie(session.token));
      writePlan(
        reply,
        jsonPlan(200, {
          ok: true,
          user: session.user
        })
      );
    } catch (error) {
      const parsed = parseError(error);
      writePlan(
        reply,
        jsonPlan(parsed.status, {
          ok: false,
          code: parsed.code,
          message: parsed.message
        })
      );
    }
  }

  @Post('logout')
  async logout(@Res() reply: FastifyReply): Promise<void> {
    reply.header('set-cookie', this.auth.serializeLogoutCookie());
    writePlan(
      reply,
      jsonPlan(200, {
        ok: true
      })
    );
  }

  @Post('register-password')
  async registerPassword(
    @Req() request: FastifyRequest,
    @Body() body: AuthRegisterPasswordDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    try {
      const user = await this.auth.authenticateFromHeaders(request.headers as Record<string, unknown>);
      if (!user) {
        writePlan(
          reply,
          jsonPlan(401, {
            ok: false,
            code: 'unauthorized',
            message: '로그인이 필요합니다.'
          })
        );
        return;
      }
      const session = await this.auth.updateLocalCredential(user.accountId, {
        loginId: body.loginId,
        password: body.password,
        passwordConfirm: body.password
      });
      reply.header('set-cookie', this.auth.serializeSessionCookie(session.token));
      writePlan(
        reply,
        jsonPlan(200, {
          ok: true,
          user: session.user
        })
      );
    } catch (error) {
      const parsed = parseError(error);
      writePlan(
        reply,
        jsonPlan(parsed.status, {
          ok: false,
          code: parsed.code,
          message: parsed.message
        })
      );
    }
  }

  @Post('local-credential')
  async updateLocalCredential(
    @Req() request: FastifyRequest,
    @Body() body: AuthUpdateLocalCredentialDto,
    @Res() reply: FastifyReply
  ): Promise<void> {
    try {
      const user = await this.auth.authenticateFromHeaders(request.headers as Record<string, unknown>);
      if (!user) {
        writePlan(
          reply,
          jsonPlan(401, {
            ok: false,
            code: 'unauthorized',
            message: '로그인이 필요합니다.'
          })
        );
        return;
      }
      const session = await this.auth.updateLocalCredential(user.accountId, {
        ...(typeof body.loginId === 'string' ? { loginId: body.loginId } : {}),
        ...(typeof body.password === 'string' ? { password: body.password } : {}),
        ...(typeof body.passwordConfirm === 'string' ? { passwordConfirm: body.passwordConfirm } : {})
      });
      reply.header('set-cookie', this.auth.serializeSessionCookie(session.token));
      writePlan(
        reply,
        jsonPlan(200, {
          ok: true,
          user: session.user
        })
      );
    } catch (error) {
      const parsed = parseError(error);
      writePlan(
        reply,
        jsonPlan(parsed.status, {
          ok: false,
          code: parsed.code,
          message: parsed.message
        })
      );
    }
  }

  @Get('github/start')
  async githubStart(
    @Req() request: FastifyRequest,
    @Query('redirect') redirect: string | undefined,
    @Res() reply: FastifyReply
  ): Promise<void> {
    try {
      const authorizeUrl = await this.auth.buildGithubAuthorizeUrl(request, redirect);
      reply.redirect(authorizeUrl);
    } catch (error) {
      const parsed = parseError(error);
      const fallback = appendQuery(this.auth.getDefaultPostLoginRedirectPath() || DEFAULT_POST_LOGIN_PATH, 'auth_error', parsed.code);
      reply.redirect(fallback);
    }
  }

  @Get('github/callback')
  async githubCallback(
    @Req() request: FastifyRequest,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() reply: FastifyReply
  ): Promise<void> {
    if (!code || !state) {
      reply.redirect(
        appendQuery(this.auth.getDefaultPostLoginRedirectPath() || DEFAULT_POST_LOGIN_PATH, 'auth_error', 'missing_code_or_state')
      );
      return;
    }
    try {
      const session = await this.auth.completeGithubCallback(request, code, state);
      reply.header('set-cookie', this.auth.serializeSessionCookie(session.token));
      reply.redirect(session.redirectPath || DEFAULT_POST_LOGIN_PATH);
    } catch (error) {
      const parsed = parseError(error);
      reply.redirect(appendQuery(this.auth.getDefaultPostLoginRedirectPath() || DEFAULT_POST_LOGIN_PATH, 'auth_error', parsed.code));
    }
  }
}
